# NodeSpace Agent Instructions

You have access to NodeSpace MCP tools for creating and editing semantic node graphs. Think of NodeSpace as a **visual knowledge canvas** — nodes represent concepts, edges represent relationships. NodeSpace derives positions automatically by default; force-directed layout remains optional.

## Graph File Model

If the desktop workspace is an Obsidian Vault, the MCP server uses the graph folder selected in NodeSpace. New Vaults default to `./NodeSpace`; an existing legacy selection is preserved. Markdown notes elsewhere in the Vault remain source documents and are not MCP graph files.

Each graph is a `.json` file containing three arrays:

```
file: <name>.json
{
  nodes: [{ id, label, x, y, headingLevel(1-6), tags[], note, color, radius, fixed, collapsed, hyperlink, mediaUrl, mediaType }],
  edges: [{ source, target, label, color, arrow, lineStyle, kind? }],
  groups: [{ id, label, displayMode, color, borderColor, opacity, nodeColorMode }]
}
```

- **Groups match nodes by tag** — a group with `label: "AI"` automatically wraps all nodes that have `"AI"` in their `tags` array.

## Workflow

### 1. Always start by reading the graph (or a node's local context)

For small graphs, read everything:
```
read_graph(name="<graph-name>")
```

For large graphs (1000+ nodes), read just the area you need:
```
read_node_context(graph="<graph-name>", nodeId="<node-id>", depth=1)
```
This returns only one node + its direct neighbors + the edges between them, avoiding loading thousands of unrelated nodes.
This shows you all existing nodes, edges, groups, and settings.

### 2. Create nodes in batches when possible
Use `create_nodes_batch` instead of calling `create_node` multiple times. It's faster and reduces tool calls.

### 3. Let the app derive positions by default
Graphs default to `settings.layoutMode = "auto"`. `x/y` are a render cache, so callers normally do not need to maintain them. Call `layout_nodes` only when the user explicitly asks for a circle, grid, or random manual arrangement:
```
layout_nodes(name="<graph>", mode="circle", spacing=150)
```

### 4. Create edges after nodes exist
Use `create_edge` to connect related nodes. Edges form the structure of the graph.

### 5. Create groups for visual categorization
Groups wrap tagged nodes and add colored backgrounds. A group's `label` must match the node's `tag`.

## Node Design Conventions

- **headingLevel**: 1 = primary topic (largest), 6 = detail (smallest). Use to create visual hierarchy.
- **tags**: Use for categorization. Multiple tags per node are supported.
- **color**: Hex format like `#5B8FF9`. If not set, NodeSpace auto-assigns based on headingLevel.
- **fixed**: Set `true` only when a node must remain at an absolute user-chosen position.
- In automatic layout, ordinary drag coordinates are temporary view state and are not persisted. Express intent through hierarchy, relationship kinds, heading levels, groups, and tags instead.
- **collapsed**: Set `true` to hide child nodes (semantic only, no auto-hierarchy).
- **note**: Long-form text attached to a node. Useful for context.
- **hyperlink**: URL that opens when clicked.

## Edge Design Conventions

- **color**: Default is `#BFBFBF`. Use for semantic coloring (red = conflict, green = support, etc.)
- **lineStyle**: `"solid"` (default), `"dash"`, `"dash-2"`, `"dash-3"`
- **arrow**: `"none"` (bidirectional), `"forward"` (source→target), `"reverse"`, `"both"`

## Typical Patterns

### Brainstorming / Mind Map
```
create_nodes_batch(graph="ideas", nodes=[
  { label: "Central Topic", headingLevel: 1, x: 400, y: 300, fixed: true },
  { label: "Sub-topic A", headingLevel: 2 },
  { label: "Sub-topic B", headingLevel: 2 },
  ...
])
→ layout_nodes(graph="ideas", mode="circle")
→ create_edge for central → each subtopic
```

### Knowledge Graph / Concept Map
```
create_nodes_batch(graph="knowledge", nodes=[
  { label: "Concept A", tags: ["philosophy"], headingLevel: 1 },
  { label: "Concept B", tags: ["philosophy"], headingLevel: 2 },
  { label: "Concept C", tags: ["science"], headingLevel: 1 },
])
→ create_edge for related concepts
→ create_group(label="philosophy", color="#5B8FF9")  // wraps all "philosophy" nodes
→ create_group(label="science", color="#F59E0B")
→ layout_nodes(graph="knowledge", mode="circle")
```

### Analysis / Breakdown
```
read_graph(graph="analysis")  // see existing structure
→ update_node for nodes needing correction
→ create_edge to add missing connections
→ delete_node for irrelevant nodes
→ get_stats(graph="analysis")  // verify counts
```

## Tips

1. **Use headingLevel for hierarchy, tags for categories, groups for visual clustering.**
2. **Prefer `layoutMode: "auto"`** — use `layout_nodes` only for an explicitly requested manual arrangement.
3. **Read before writing** — check `read_graph` (small) or `read_node_context` (large) or `search_nodes` to avoid duplicate IDs.
4. **Node IDs** are auto-generated from `label + random suffix`. If you need to reference a node later, save its ID from the creation response.
5. **Batch delete is not available** — delete nodes one at a time, but note that deleting a node auto-deletes its edges.
6. **Settings** can be modified via `read_settings` and `update_settings`. This covers all "图区自定义" options: theme, grid, simulation physics, fonts, color style, snap behavior, etc.
7. **Large graphs** (>1000 nodes): use `read_node_context` and `search_nodes` instead of `read_graph` to stay within context limits. Automatic layout is event-driven and stops after calculating positions.

## Edge Cases

- Creating a node in a non-existent graph → auto-creates the graph file.
- Creating a duplicate edge → returns an error, edges are unique per (source, target) pair.
- Deleting a node → automatically removes ALL edges connected to that node.
- Deleting a group → nodes are unaffected, only the visual wrapper is removed.
- File changes made via MCP are detected by the running NodeSpace app within ~500ms and auto-reload.

## Complete Tool Reference

| Tool | Category |
|---|---|
| `list_graphs` | List all graph files |
| `create_graph` / `delete_graph` / `rename_graph` | File management |
| `read_graph` | Read full graph |
| `read_node_context` | Read one node + neighbors (for large graphs) |
| `search_nodes` | Search by label/tag/headingLevel |
| `create_node` / `create_nodes_batch` | Create nodes |
| `update_node` / `delete_node` | Modify/delete nodes |
| `create_edge` / `update_edge` / `delete_edge` | Full edge CRUD |
| `create_group` / `update_group` / `delete_group` | Full group CRUD |
| `get_stats` | Node/edge/tag statistics |
| `layout_nodes` | Auto-arrange (circle/grid/random) |
| `read_settings` / `update_settings` | All graph settings |
