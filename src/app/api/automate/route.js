// File: src/app/api/automate/route.js

import axios from "axios";

// --- STREAM HELPERS ---
function makeStream() {
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();
  const encoder = new TextEncoder();
  const send = async (obj) => {
    const line = JSON.stringify(obj) + "\n";
    await writer.write(encoder.encode(line));
  };
  return { stream: ts.readable, writer, send };
}

// --- ERP HELPERS ---
async function erpApiCall(path, params, sid) {
  const url = `https://erp.vidyaacademy.ac.in/web${path}`;
  const payload = { jsonrpc: "2.0", method: "call", params };
  const headers = { Cookie: `sid=${sid}` };
  const response = await axios.post(url, payload, { headers });
  if (response.data.error) {
    console.error(
      "Server Error Details:",
      JSON.stringify(response.data.error, null, 2)
    );
    throw new Error(response.data.error.message);
  }
  return response.data.result;
}

async function login(username, password) {
  const url = "https://erp.vidyaacademy.ac.in/web/session/authenticate";
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      db: "liveone",
      login: username.toUpperCase(),
      password: password,
      base_location: "https://erp.vidyaacademy.ac.in",
      context: {},
    },
  };

  try {
    const response = await axios.post(url, payload);
    const result = response.data;
    if (result.result && result.result.uid) {
      const sid = response.headers["set-cookie"][0].split(";")[0].split("=")[1];
      const { session_id, uid } = result.result;
      return { sid, session_id, uid };
    } else {
      throw new Error("Incorrect username or password.");
    }
  } catch (error) {
    throw new Error("Failed to log in. Please check your credentials.");
  }
}

// --- CORE AUTOMATION LOGIC WITH EMITS ---
async function automateFeedback(sid, session_id, uid, logs, emit) {
  const model = "vict.feedback.student.batch.feedback";
  const topLevelContext = { lang: "en_GB", tz: "Asia/Kolkata", uid };
  const kwArgsContext = {
    ...topLevelContext,
    search_default_group_feedback_id: 1,
    search_default_group_batch: 1,
    search_default_group_semester: 1,
  };

  // STEP 1: Batch
  logs.push("1) Fetching dynamic batch ID...");
  await emit({
    type: "status",
    step: "batch",
    progress: 5,
    message: "Fetching dynamic batch ID...",
  });

  const batchIdResult = await erpApiCall(
    "/dataset/call_kw",
    {
      model,
      method: "read_group",
      args: [],
      kwargs: {
        domain: [["login_id", "=", uid]],
        fields: ["gt_batch_id"],
        groupby: ["gt_batch_id"],
        context: kwArgsContext,
      },
      session_id,
      context: topLevelContext,
    },
    sid
  );
  const gt_batch_id = batchIdResult[0].gt_batch_id[0];
  const batchName = batchIdResult[0].gt_batch_id[1];
  logs.push(`    Found Batch: ${batchName} (ID: ${gt_batch_id})`);
  await emit({
    type: "status",
    step: "batch",
    progress: 100,
    message: `Found ${batchName}`,
  });

  // STEP 2: Semester
  logs.push("2) Fetching available semesters...");
  await emit({
    type: "status",
    step: "semester",
    progress: 5,
    message: "Fetching semesters...",
  });

  const semestersResult = await erpApiCall(
    "/dataset/call_kw",
    {
      model,
      method: "read_group",
      args: [],
      kwargs: {
        domain: [
          ["gt_batch_id", "=", gt_batch_id],
          ["login_id", "=", uid],
        ],
        fields: ["semester"],
        groupby: ["semester"],
        context: kwArgsContext,
      },
      session_id,
      context: topLevelContext,
    },
    sid
  );
  const latestSemester = semestersResult[semestersResult.length - 1];
  const semesterId = latestSemester.semester[0];
  logs.push(`    Found latest semester: ${latestSemester.semester[1]}`);
  await emit({
    type: "status",
    step: "semester",
    progress: 100,
    message: `Found ${latestSemester.semester[1]}`,
  });

  // STEP 3: Config
  logs.push("3) Fetching feedback configuration...");
  await emit({
    type: "status",
    step: "config",
    progress: 5,
    message: "Fetching config...",
  });

  const configResult = await erpApiCall(
    "/dataset/call_kw",
    {
      model,
      method: "read_group",
      args: [],
      kwargs: {
        domain: [
          ["semester", "=", semesterId],
          ["gt_batch_id", "=", gt_batch_id],
          ["login_id", "=", uid],
        ],
        fields: ["config_id"],
        groupby: ["config_id"],
        context: kwArgsContext,
      },
      session_id,
      context: topLevelContext,
    },
    sid
  );

  // Handle cases where no feedback configurations are returned
  if (!configResult || configResult.length === 0) {
    throw new Error(
      "No feedback configurations found for the latest semester."
    );
  }

  // Use reduce to find the configuration with the highest ID
  const latestConfig = configResult.reduce((latest, current) => {
    // The ID is the first element (index 0) of the 'config_id' array
    return current.config_id[0] > latest.config_id[0] ? current : latest;
  });

  // Extract the ID and name from the selected latest config
  const configId = latestConfig.config_id[0];
  const configName = latestConfig.config_id[1];

  logs.push(`    Found latest config: ${configName} (ID: ${configId})`);
  await emit({
    type: "status",
    step: "config",
    progress: 100,
    message: `Found: ${configName}`, // A more descriptive message for the UI
  });

  // STEP 4: Pending feedbacks
  logs.push("4) Fetching all pending feedback forms...");
  await emit({
    type: "status",
    step: "pending",
    progress: 5,
    message: "Finding pending forms...",
  });

  const pendingFeedbacks = await erpApiCall(
    "/dataset/search_read",
    {
      model: model,
      fields: ["id", "employeename", "course", "state"],
      domain: [
        ["config_id", "=", configId],
        ["state", "=", "draft"],
        ["login_id", "=", uid],
      ],
      context: kwArgsContext,
      session_id: session_id,
      limit: 80,
    },
    sid
  );
  const feedbackRecords = pendingFeedbacks.records;
  if (!feedbackRecords.length) {
    logs.push("🎉 No pending feedback forms found. You are all done!");
    await emit({
      type: "status",
      step: "pending",
      progress: 100,
      message: "No pending forms",
    });
    await emit({
      type: "status",
      step: "submit",
      progress: 100,
      completed: 0,
      total: 0,
      message: "Nothing to submit",
    });
    return;
  }
  logs.push(`    Found ${feedbackRecords.length} feedback forms to submit.`);
  await emit({
    type: "status",
    step: "pending",
    progress: 100,
    message: `Found ${feedbackRecords.length} forms`,
  });

  // STEP 5: Submit loop
  logs.push("5) Submitting feedback for each teacher...");
  await emit({
    type: "status",
    step: "submit",
    progress: 1,
    total: feedbackRecords.length,
    completed: 0,
    message: `Submitting ${feedbackRecords.length} forms...`,
  });

  let completed = 0;
  for (const record of feedbackRecords) {
    try {
      const { id: feedbackId, employeename, course } = record;
      const courseName = Array.isArray(course) ? course[1] : "";
      logs.push(`   -> Submitting for ${employeename} (${courseName})...`);

      const formDetails = await erpApiCall(
        "/dataset/call_kw",
        {
          model,
          method: "read",
          args: [[feedbackId], ["questions_line"]],
          kwargs: { context: kwArgsContext },
          session_id,
          context: topLevelContext,
        },
        sid
      );

      const questionIds = formDetails[0]?.questions_line || [];
      const answersPayload = questionIds.map((qid) => [
        1,
        qid,
        { mark_state: 1 },
      ]);

      if (answersPayload.length > 0) {
        await erpApiCall(
          "/dataset/call_kw",
          {
            model,
            method: "write",
            args: [[feedbackId], { questions_line: answersPayload }],
            kwargs: { context: kwArgsContext },
            session_id,
            context: topLevelContext,
          },
          sid
        );
      }

      await erpApiCall(
        "/dataset/call_button",
        {
          model,
          method: "button_submit",
          args: [[feedbackId], kwArgsContext],
          session_id,
          context: topLevelContext,
        },
        sid
      );

      completed += 1;
      logs[logs.length - 1] += " Done.";
      const percent = Math.round((completed / feedbackRecords.length) * 100);
      await emit({
        type: "status",
        step: "submit",
        progress: percent,
        total: feedbackRecords.length,
        completed,
        message: `Submitted ${employeename} (${courseName})`,
      });
    } catch (err) {
      logs.push(
        `   -> Error submitting for ${record.employeename}: ${err.message}`
      );
      await emit({
        type: "status",
        step: "submit",
        message: `Error with ${record.employeename}: ${err.message}`,
      });
      // continue to next form
    }
  }

  logs.push(" All feedback submitted successfully!");
}

// --- API HANDLER (streams NDJSON) ---
export async function POST(request) {
  const { stream, writer, send } = makeStream();
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return new Response(
      JSON.stringify({ error: "Username and password are required." }),
      { status: 400 }
    );
  }

  const logs = [];

  // Start async work and stream updates
  (async () => {
    try {
      await send({
        type: "status",
        step: "login",
        progress: 5,
        message: "Logging in...",
      });
      const credentials = await login(username, password);
      logs.push(" Login Successful.");
      await send({
        type: "status",
        step: "login",
        progress: 100,
        message: "Login successful",
      });

      const emit = async (evt) => {
        if (evt.message) {
          await send({ type: "log", message: evt.message });
        }
        await send({ ...evt, message: evt.message });
      };

      await automateFeedback(
        credentials.sid,
        credentials.session_id,
        credentials.uid,
        logs,
        emit
      );

      await send({ type: "done", logs });
    } catch (error) {
      logs.push(` An error occurred: ${error.message}`);
      await send({ type: "error", message: error.message, logs });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
