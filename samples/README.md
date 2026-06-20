# Demo sample files

These files let you try the workflow stage blocks without pasting your own logs. They
model a customer-support assistant whose conversation runs `gate → answer → judge (with
retries)`.

In the app, expand a conversation flow. The **shared user message** is a flow-level block;
each stage (gate, answer→judge, …) is its own block with its sample fields inline — use the
file picker in the matching block to load each file. Then click **Estimate workflow** to
turn the samples into per-conversation token averages. The `(template only)` prompt fields
want the prompt scaffolding without the user message or draft answer baked in (those are
counted separately).

## User-first preset (`[gate, answer → judge]`)

| Block · field in the app             | File                     | Format                |
| ------------------------------------ | ------------------------ | --------------------- |
| Shared user message (flow-level)     | `user-messages.json`     | JSON chat transcript  |
| Gate · Gate prompt (template only)   | `evaluation-prompt.txt`  | Plain text            |
| Gate · Gate decision output          | `gate-decisions.json`    | JSON (optional)       |
| Answer → Judge · Answer prompt (template only) | `answer-prompt.txt` | Plain text         |
| Answer → Judge · Draft LLM answer    | `draft-answers.txt`      | One answer per line   |
| Answer → Judge · Judge prompt (template only)  | `judge-prompt.txt`  | Plain text          |
| Answer → Judge · Judge decision output | `judge-decisions.json` | JSON (optional)       |

## Assistant-first preset (adds an Opening stage on top)

| Block · field in the app            | File                     | Format                |
| ----------------------------------- | ------------------------ | --------------------- |
| Opening · Opening prompt (template) | `opening-prompt.txt`     | Plain text            |
| Opening · Opening message           | `opening-messages.txt`   | One message per line  |

The files intentionally mix JSON transcripts and newline-delimited text so you can see
both parsing paths the calculator supports. JSON objects are flattened by pulling text
out of known keys (`content`, `text`, `prompt`, `message`, `reason`, …); plain files are
split into one sample per non-empty line.
