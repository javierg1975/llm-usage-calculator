# Demo sample files

These files let you try the **Token Estimation Samples** tab without pasting your own
logs. They model a customer-support assistant whose conversation runs
`trigger → gate → answer → judge (with retries)`.

In the app, expand a conversation flow, open the **Token Estimation Samples** tab, and
use the file picker under each field to load the matching file. Then click
**Estimate workflow** to turn the samples into per-conversation token averages.

## User-first flow

| Field in the app            | File                     | Format                |
| --------------------------- | ------------------------ | --------------------- |
| 1) Sample user message      | `user-messages.json`     | JSON chat transcript  |
| 2) Evaluation prompt        | `evaluation-prompt.txt`  | Plain text            |
| 2) Gate decision output     | `gate-decisions.json`    | JSON (optional)       |
| 3.a) Answer prompt          | `answer-prompt.txt`      | Plain text            |
| 3.a) Draft LLM answer       | `draft-answers.txt`      | One answer per line   |
| 4) Judge prompt             | `judge-prompt.txt`       | Plain text            |
| 4) Judge decision output    | `judge-decisions.json`   | JSON (optional)       |

## Assistant-first opener (extra fields)

| Field in the app            | File                     | Format                |
| --------------------------- | ------------------------ | --------------------- |
| 0) Opening prompt           | `opening-prompt.txt`     | Plain text            |
| 0) Opening message          | `opening-messages.txt`   | One message per line  |

The files intentionally mix JSON transcripts and newline-delimited text so you can see
both parsing paths the calculator supports. JSON objects are flattened by pulling text
out of known keys (`content`, `text`, `prompt`, `message`, `reason`, …); plain files are
split into one sample per non-empty line.
