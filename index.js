const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

const GITHUB_TOKEN = core.getInput("githubToken");
const YT_TOKEN = core.getInput("youtrackToken");
const YT_URL = core.getInput("youtrackUrl");
const YT_ISSUE = "api/issues/";
const REPO_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}`;
const PR_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}/pull/${github.context.issue.number}`;
const REGEX = core.getInput("issueRegex", { required: true });
const ISSUE_REGEX = new RegExp(REGEX, "g");

const ytApi = axios.create({
  headers: {
    authorization: `Bearer ${YT_TOKEN}`,
    accept: "application/json",
    "cache-control": "no-cache",
    "content-type": "application/json"
  },
  baseURL: YT_URL + (YT_URL.endsWith("/") ? "" : "/") + YT_ISSUE
});

const octokit = new github.GitHub(GITHUB_TOKEN);

async function run() {
  const tickets = getMatchingTickets();

  if (tickets.length === 0) {
    throw "PR description does not contain any issue ID.";
  }

  console.log(`Found issues: ${tickets.join(",")}.`);

  tickets.forEach(async id => await checkIssueExist(id));

  await commentPR(
    `Linked PR to issues:
${tickets.map(id => `- [${id}](${getIssueLink(id)})`).join("\n")}`
  );

  console.log("Commented PR with linked issues.");

  tickets.forEach(async issueId => {
    await commentYT(
      issueId,
      `New PR [#${github.context.issue.number}](${PR_URL}) opened at [${github.context.issue.owner}/${github.context.issue.repo}](${REPO_URL}) by ${github.context.actor}.`
    );
  });

  console.log(`Commented YT issues with the according PR.`);

  await updatePR();

  console.log("Updated PR description with YT links.");

  tickets.forEach(async issueId => {
    const fields = getFields(issueId);

    const currentState = fields.find(x => x.name === "State");
    const currentStateValue =
      currentState &&
      currentState.value &&
      currentState.value.name.toLowerCase();

    if (["to do", "to fix", "in progress"].some(x => x == currentStateValue)) {
      const response = await ytApi.post(
        `${issueId}/fields/${currentState.id}?fields=name,id,value(name)`,
        {
          value: {
            name: "PR Open"
          }
        }
      );

      console.log(`Changed issue to PR Open ${response.status}`);

      await commentPR(
        `Issue [${issueId}](${getIssueLink(issueId)}) changed from *${
          currentState.value.name
        }* to *PR Open*`
      );
    }

    const currentType = fields.find(x => x.name === "Type");

    if (currentType && currentType.value && currentType.value.name) {
      labelPR([`@yt/type/${currentType.value.name}`]);
    }
  });

  core.setOutput("issues", tickets);
}

async function labelPR(labels) {
  await octokit.issues.addLabels({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    issue_number: github.context.issue.number,
    labels
  });
}

async function getPrDescription() {
  const pr = await octokit.pulls.get({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    pull_number: github.context.pull.number
  });

  console.log(pr);
  return pr.description;
}

function getMatchingTickets() {
  console.log(`Checking ${ISSUE_REGEX} against the PR description`);

  const description = getPrDescription();
  console.log(description);
  const matches = [...description.matchAll(ISSUE_REGEX)];

  return matches.map(x => x[0]);
}

async function checkIssueExist(issueId) {
  const response = await ytApi.get(`api/issues/${issueId}`);

  if (response.status === 404) {
    throw new Error(`Issue ${issueId} not found in your YouTrack instance.`);
  } else if (response.statusText != "OK") {
    throw new Error(`Unknown error connecting to YouTrack ${response.status}`);
  }
}

async function commentPR(body) {
  await octokit.issues.createComment({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    issue_number: github.context.issue.number,
    body
  });
}

async function commentYT(issueId, text) {
  await ytApi.post(`${issueId}/comments`, {
    text,
    usesMarkdown: true
  });
}

async function updatePR() {
  const description = getPrDescription();
  description.replace(ISSUE_REGEX, ticket => `[${ticket}](${YT_URL}${ticket})`);

  await octokit.pulls.update({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    pull_number: github.context.pull.number,
    body: description
  });
}

async function getFields(issueId) {
  const response = await ytApi.get(
    `${issueId}/fields?fields=name,id,value(name)`
  );

  return response.data;
}

function getIssueLink(id) {
  return `${YT_URL}issue/${id}`;
}

try {
  run();
} catch (error) {
  core.setFailed(error.message);
}
