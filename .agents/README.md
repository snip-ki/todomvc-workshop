# Agent skills

Canonical project skills live in [`skills/`](skills/).

| Harness     | How it loads these skills                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Codex       | [`.agents/skills/`](skills/) at repo root ([OpenAI Codex docs](https://developers.openai.com/codex/skills))                   |
| Pi          | Same [`.agents/skills/`](skills/) after you `/trust` the project ([Pi skills docs](https://pi.dev/docs/latest/skills))        |
| Cursor      | Same [`.agents/skills/`](skills/) ([Cursor docs](https://cursor.com/docs/skills))                                             |
| Claude Code | Per-skill symlinks under [`.claude/skills/`](../.claude/skills/) ([Claude Code docs](https://code.claude.com/docs/en/skills)) |

Edit skill content only under `skills/`. After adding a skill folder, link it for Claude Code:

```sh
mkdir -p .claude/skills
name=your-skill-name
ln -sf "../../.agents/skills/$name" ".claude/skills/$name"
```
