const axios = require("axios");
const readline = require("readline");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// --- HELPER FUNCTIONS ---

async function erpApiCall(path, params, sid) {
  const url = `https://erp.vidyaacademy.ac.in/web${path}`;
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: params,
  };
  const headers = { Cookie: `sid=${sid}` };
  const response = await axios.post(url, payload, { headers });
  if (response.data.error) {
    console.error(
      "\nServer Error Details:",
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

// --- CORE FEATURE ---

async function automateFeedback(sid, session_id, uid) {
  const model = "vict.feedback.student.batch.feedback";
  const topLevelContext = { lang: "en_GB", tz: "Asia/Kolkata", uid };
  const kwArgsContext = {
    ...topLevelContext,
    search_default_group_feedback_id: 1,
    search_default_group_batch: 1,
    search_default_group_semester: 1,
  };

  console.log("\n--- Starting Feedback Automation ---");

  // STEP 1: Dynamically get the gt_batch_id
  console.log("1. Fetching dynamic batch ID...");
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
  console.log(`   ✅ Found Batch: ${batchName} (ID: ${gt_batch_id})`);

  // STEP 2: Get the latest semester
  console.log("2. Fetching available semesters...");
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
  console.log(`   ✅ Found latest semester: ${latestSemester.semester[1]}`);

  // STEP 3: Get the feedback configuration
  console.log("3. Fetching feedback configuration...");
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

  const configId = configResult[0].config_id[0];
  console.log(`   ✅ Found config ID: ${configId}`);

  // STEP 4: Get all pending feedback forms
  console.log("4. Fetching all pending feedback forms...");
  // CORRECTED: Restructured the params for search_read. No 'kwargs' wrapper.
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
      limit: 80, // Using a default limit
    },
    sid
  );

  const feedbackRecords = pendingFeedbacks.records;
  if (feedbackRecords.length === 0) {
    console.log("\n🎉 No pending feedback forms found. You are all done!");
    return;
  }
  console.log(
    `   ✅ Found ${feedbackRecords.length} feedback forms to submit.`
  );

  // STEP 5: Loop through each form and submit it
  console.log("5. Submitting feedback for each teacher...");
  for (const record of feedbackRecords) {
    const { id: feedbackId, employeename, course } = record;
    process.stdout.write(
      `   -> Submitting for ${employeename} (${course[1]})... `
    );

    // Get Question IDs
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
    const questionIds = formDetails[0].questions_line;

    // Write Answers
    const answersPayload = questionIds.map((qid) => [
      1,
      qid,
      { mark_state: 1 },
    ]);
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

    // Finalize Submission
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

    console.log("Done.");
  }
  console.log("\n🎉 All feedback submitted successfully!");
}

// --- MAIN FUNCTION ---
async function main() {
  console.log("Welcome to the VAST ERP Feedback Automator");
  console.log("---");
  rl.question("Enter your ERP username: ", (username) => {
    rl.question("Enter your ERP password: ", async (password) => {
      try {
        console.log("\nLogging in...");
        const credentials = await login(username, password);
        console.log("✅ Login Successful.");
        await automateFeedback(
          credentials.sid,
          credentials.session_id,
          credentials.uid
        );
      } catch (error) {
        console.error(`\n❗ An error occurred: ${error.message}`);
      } finally {
        rl.close();
      }
    });
  });
}

main();
