const core = require('@actions/core');
const github = require('@actions/github');


// most @actions toolkit packages have async methods
async function run() {
  try {
    const myToken = core.getInput('githubToken');

    const octokit = new github.GitHub(myToken);
    const titleRegex = core.getInput('issueRegex', {required: true});
    core.debug(`Checking ${titleRegex} against the PR title`);

    const title = getPrTitle();
    console.log(`title: ${title}`);

    const reg = new RegExp(titleRegex);
    const ext = reg.exec(title);
    if (ext === null) {
      core.setFailed("PR title does not contain any issue ID");
    }
    const issueId = ext[0];
    core.debug(`Found issue ID ${issueId}`);
    const ytUrl = core.getInput('youtrackUrl');
    const body = ytUrl + ytUrl.endsWith("/") ? "" : "/" + "issue/" + issueId;
    await octokit.issues.createComment({
      owner: github.context.issue.owner,
      repo: github.context.issue.repo,
      issue_number: github.context.issue.number,
      body: body
    });
    core.setOutput('issueId', issueId);
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

const getPrTitle = () => {
  if (github.context && github.context.payload && github.context.payload.pull_request) {
    return github.context.payload.pull_request.title;
  }
};

run();
