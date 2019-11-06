const core = require('@actions/core');
const github = require('@actions/github');
const fetch = require('node-fetch');


// most @actions toolkit packages have async methods
async function run() {
  try {
    const myToken = core.getInput('githubToken');

    const octokit = new github.GitHub(myToken);
    const titleRegex = core.getInput('issueRegex', {required: true});
    console.log(`Checking ${titleRegex} against the PR title`);

    const title = getPrTitle();
    console.log(`title: ${title}`);

    const reg = new RegExp(titleRegex);
    const ext = reg.exec(title);
    if (ext === null) {
      core.setFailed("PR title does not contain any issue ID");
    }
    const issueId = ext[0];
    console.log(`Found issue ID ${issueId}`);
    const ytUrl = core.getInput('youtrackUrl') + (core.getInput('youtrackUrl').endsWith("/") ? "" : "/");
    const ytToken = core.getInput('youtrackToken');
    const ytApiIssueUrl = ytUrl + 'api/issues/' + issueId;
    await fetch(ytApiIssueUrl, {
      "method": "GET",
      "headers": {
        "authorization": "Bearer " + ytToken,
        "accept": "application/json",
        "cache-control": "no-cache",
        "content-type": "application/json"
      }
    })
      .then(async response => {
        if (response.ok) {
          console.log(`Issue found in YT`);
          const ytApiIssueCommentUrl = ytApiIssueUrl + '/comments';
          const repoUrl = `https://github.com/${github.context.issue.owner}/${github.context.issue.owner}`;
          const pullUrl = `https://github.com/${github.context.issue.owner}/${github.context.issue.owner}/pull/17`;
          await fetch(ytApiIssueCommentUrl, {
            "method": "POST",
            "headers": {
              "authorization": "Bearer " + ytToken,
              "accept": "application/json",
              "cache-control": "no-cache",
              "content-type": "application/json"
            },
            body: JSON.stringify({
              text: `New Pull Request [#${github.context.issue.number}](${pullUrl}) opened at [${github.context.issue.owner}/${github.context.issue.owner}](${repoUrl}).`,
              usesMarkdown: true,
            })
          }).then(response => {
            console.log(`Comment stored in YT with status ${response.status}`);
          })
            .catch(err => {
              core.setFailed(err.message);
            });
        } else {
          if (response.status === 404) {
            console.log(`Issue not found in YT with code ${response.status}`);
            core.setFailed(`Issue ${issueId} not found in your Youtrack instance.`);
          } else {
            core.setFailed(`Unknown error connecting to youtrack ${response.status}`);
          }
        }
      })
      .catch(err => {
        core.setFailed(err.message);
      });
    const body = ytUrl + "issue/" + issueId;
    await octokit.issues.createComment({
      owner: github.context.issue.owner,
      repo: github.context.issue.repo,
      issue_number: github.context.issue.number,
      body: body,
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
