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
    const ytHeaders = {
      "headers": {
        "authorization": "Bearer " + ytToken,
        "accept": "application/json",
        "cache-control": "no-cache",
        "content-type": "application/json"
      }
    };
    await fetch(ytApiIssueUrl, {
      "method": "GET",
      ...ytHeaders
    })
      .then(async response => {
        if (response.ok) {
          const body = `PR attached to issue [${issueId}](${ytUrl}issue/${issueId})`;
          await octokit.issues.createComment({
            owner: github.context.issue.owner,
            repo: github.context.issue.repo,
            issue_number: github.context.issue.number,
            body: body,
          });
          console.log(`Issue found in YT`);
          const ytApiIssueCommentUrl = ytApiIssueUrl + '/comments';
          const ytApiGetFields = ytApiIssueUrl + '/fields?fields=name,id,value(name)';
          const ytApiChangeStateField = stateFieldId => ytApiIssueUrl + `/fields/${stateFieldId}?fields=name,id,value(name)`;
          const repoUrl = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}`;
          const pullUrl = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}/pull/${github.context.issue.number}`;
          await fetch(ytApiIssueCommentUrl, {
            "method": "POST",
            ...ytHeaders,
            body: JSON.stringify({
              text: `New Pull Request [#${github.context.issue.number}](${pullUrl}) opened at [${github.context.issue.owner}/${github.context.issue.repo}](${repoUrl}) by ${github.context.actor}.`,
              usesMarkdown: true,
            })
          }).then(response => {
            console.log(`Comment stored in YT with status ${response.status}`);
          }).catch(err => {
              core.setFailed(err.message);
            });
          const fields = await fetch(ytApiGetFields, {
            "method": "GET",
            ...ytHeaders
          }).then(response => {
            console.log(`Got issue fields ${response.status}`);
            return response.json();
          }).catch(err => {
            core.setFailed(err.message);
          });
          const currentState = fields.find(x => x.name === "State");
          const currentStateValue = currentState && currentState.value && currentState.value.name.toLowerCase();
          if (currentStateValue === 'to do' || currentStateValue === 'to fix' || currentStateValue === 'in progress') {
            const statePayload = {
              "value": {
                "name": "PR Open"
              }
            };
            await fetch(ytApiChangeStateField(currentState.id), {
              "method": "POST",
              ...ytHeaders,
              body: JSON.stringify(statePayload)
            }).then(response => {
              console.log(`Changed issue to PR Open ${response.status}`);
              const body = `Issue [${issueId}](${ytUrl}issue/${issueId}) changed from *${currentState.value.name}* to *PR Open*`;
              octokit.issues.createComment({
                owner: github.context.issue.owner,
                repo: github.context.issue.repo,
                issue_number: github.context.issue.number,
                body: body,
              });
            }).catch(err => {
              core.setFailed(err.message);
            });
          }
          const currentType = fields.find(x => x.name === "Type");
          if (currentType && currentType.value && currentType.value.name){
            octokit.issues.addLabels({
              owner: github.context.issue.owner,
              repo: github.context.issue.repo,
              issue_number: github.context.issue.number,
              labels: [`@yt/type/${currentType.value.name}`]
            })
          }
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
