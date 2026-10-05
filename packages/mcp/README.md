# rmk-mcp

The registry MCP server for a [Ronne AI Marketplace](https://github.com/ronneai/ronne-marketplace).
It lets your AI coding tool search the marketplace, read items, and install, update or remove them
from the conversation: the assistant first shows a plan of every file it would change, and only
then applies exactly that plan. It uses [`rmk`](https://www.npmjs.com/package/@ronneai/rmk)'s own
install code and its login.

```sh
npm install --global @ronneai/rmk @ronneai/mcp
rmk login --registry https://your-marketplace.example
rmk mcp-setup            # registers it with the AI tools this project uses
```

Tools: `search_items`, `get_item`, `list_installed`, `check_outdated`, `plan_install`,
`plan_update`, `plan_remove` and `apply_plan`. A plan lasts 10 minutes, is applied once, and is
refused if anything it touches changed in between.

The Documentation ([Registry MCP server](https://www.ronne.ai/marketplace/docs/mcp)) explains
setting it up and each tool. Needs Node.js 22.12 or later. MIT licensed.
