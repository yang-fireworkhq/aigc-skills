# AIGC Skills

Reusable agent skills for AI video generation and prompt optimization.

| Skill | Purpose |
| --- | --- |
| [byteplus-seedance-video](byteplus-seedance-video/SKILL.md) | BytePlus Seedance 2.0, 2.0 Fast, and 2.5 video generation. |
| [minimax-h3-video](minimax-h3-video/SKILL.md) | MiniMax H3 video generation and task management. |
| [sd25-pe](sd25-pe/SKILL.md) | Seedance 2.5 prompt optimization. |
| [sd2-pe](sd2-pe/SKILL.md) | Seedance 2.0 prompt optimization. |

## Install

```bash
npx skills add yang-fireworkhq/aigc-skills
```

Install an individual skill:

```bash
npx skills add yang-fireworkhq/aigc-skills --skill sd25-pe
```

Video generation requires your own provider credentials and may incur charges. Never commit API keys or environment files.
