# Codex GH Instructions (ReloPlanner)

Use this runbook in every new Codex chat when task tracking or status sync is requested for `ksayron/ReloPlanner`.

## Scope

- Use **`gh` CLI only** (do not use GitHub connector unless explicitly requested).
- Repo: `ksayron/ReloPlanner`
- Project local path: `D:\BSTU\Projects\NODEJS_6SEM`
- Project board: `ReloPlanner Delivery Board` (`owner: ksayron`, project number: `3`)

## Critical Environment Rule (Proxy)

In this environment, `gh` may fail with:

- `proxyconnect tcp: dial tcp 127.0.0.1:9`

So every `gh` command must clear proxy vars in-command:

```powershell
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh <...>
```

## Standard Execution Sequence

1. Verify auth and repo:

```powershell
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh auth status
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh repo view ksayron/ReloPlanner --json nameWithOwner,url,defaultBranchRef
```

2. List issues and identify matching scope:

```powershell
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue list -R ksayron/ReloPlanner --state all --limit 100 --json number,title,state,labels,assignees
```

3. Sync implementation progress (Done / In Progress / Todo):

- Comment on matched issue(s) with concrete shipped changes and commit refs.
- If needed, split remaining work into a new TODO issue.

4. Align labels and state with reality:

- Done: add `status:done`, close issue.
- In progress: add `status:in-progress`, keep open.
- Planned: add `status:todo`, keep open.
- Remove conflicting status labels (`status:todo` vs `status:in-progress` vs `status:done`).

5. Sync GitHub Project board item:

- Ensure each touched issue is added to project `3`.
- Set project Status to match real state (`Todo` / `In Progress` / `Done`).
- Verify item appears in board after updates.

## Label/Status Commands

```powershell
# comment
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue comment -R ksayron/ReloPlanner <number> --body "<text>"

# set done
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue edit -R ksayron/ReloPlanner <number> --add-label "status:done" --remove-label "status:in-progress" --remove-label "status:todo"
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue close -R ksayron/ReloPlanner <number> --comment "<closing note>"

# set in progress
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue edit -R ksayron/ReloPlanner <number> --add-label "status:in-progress" --remove-label "status:todo" --remove-label "status:done"

# set todo
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue edit -R ksayron/ReloPlanner <number> --add-label "status:todo" --remove-label "status:in-progress" --remove-label "status:done"
```

## New Issue Template (Follow-up TODO)

```powershell
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh issue create -R ksayron/ReloPlanner --title "[To-Do] <title>" --body "<scope, current state, remaining tasks>" --label "status:todo"
```

## Project Board Commands

```powershell
# list projects (owner scope)
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh project list --owner ksayron

# add issue to delivery board (project 3)
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh project item-add 3 --owner ksayron --url https://github.com/ksayron/ReloPlanner/issues/<number>

# inspect board items and verify issue presence / current status
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh project item-list 3 --owner ksayron --limit 200 --format json

# list project fields (useful when explicitly editing single-select status via item-edit)
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY=''; gh project field-list 3 --owner ksayron
```

## Paste-Into-New-Chat Instruction Block

Use this text at the top of a new chat:

```text
Use gh CLI (not GitHub connector) for repo ksayron/ReloPlanner.
Always clear proxy vars before each gh command:
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:ALL_PROXY='';
Then run gh command.

When syncing work:
1) Map code changes/commits to matching issue(s)
2) Report Done / In Progress / Todo
3) Update labels and open/closed status to match real state
4) Ensure issue is present on project board #3 and status matches reality
5) If some scope is only partial, create follow-up [To-Do] issue with status:todo
```
