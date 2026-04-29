import { ReactFlow, MiniMap, Controls, Background, Panel } from "@xyflow/react";
import { useFlowCanvas } from "../hooks/useFlowCanvas";
import { LayoutPanel } from "./LayoutPanel";
import { ConnectionOverlay } from "./ConnectionOverlay";
import { NodeEditorDrawer } from "./NodeEditorDrawer";

export const FlowCanvas = () => {
  const {
    nodes,
    edges,
    connectionStatus,
    drawerOpen,
    editingNode,
    isExecuting,
    customNodeTypes,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDragOver,
    onDrop,
    onDagreLayout,
    onGridLayout,
    onCircleLayout,
    handleExecute,
    handleSaveNode,
    setDrawerOpen,
    connect,
  } = useFlowCanvas();

  return (
    <div style={{ flex: 1, height: "calc(100vh - 100px)", position: "relative" }}>
      <ConnectionOverlay connectionStatus={connectionStatus} onReconnect={connect} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={customNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />

        <Panel position="top-right">
          <LayoutPanel
            connectionStatus={connectionStatus}
            isExecuting={isExecuting}
            onExecute={handleExecute}
            onDagreLayout={onDagreLayout}
            onGridLayout={onGridLayout}
            onCircleLayout={onCircleLayout}
          />
        </Panel>
      </ReactFlow>

      <NodeEditorDrawer
        open={drawerOpen}
        node={editingNode}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveNode}
      />
    </div>
  );
};
