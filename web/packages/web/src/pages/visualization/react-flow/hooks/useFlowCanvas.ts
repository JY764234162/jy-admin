import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  NodeTypes,
  useReactFlow,
} from "@xyflow/react";
import { useYjsCollaboration } from "@/hooks/useYjsCollaboration";
import { localStg } from "@/utils/storage";
import dagre from "dagre";
import { nodeTypes } from "../components/nodeTypes";
import { CustomNode } from "../components/CustomNode";
import { mockExecuteNode, topologicalSort } from "../components/executionUtils";

const DEFAULT_ROOM = "flow-default";
const STORAGE_KEYS = {
  nodes: "reactFlowNodes" as keyof StorageType.Local,
  edges: "reactFlowEdges" as keyof StorageType.Local,
};

export interface FlowCanvasState {
  nodes: Node[];
  edges: Edge[];
  connectionStatus: import("@/hooks/useYjsCollaboration").ConnectionStatus;
  drawerOpen: boolean;
  editingNode: Node | null;
  isExecuting: boolean;
  customNodeTypes: NodeTypes;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;

  onDagreLayout: (direction: "TB" | "BT" | "LR" | "RL") => void;
  onGridLayout: () => void;
  onCircleLayout: () => void;

  handleExecute: () => Promise<void>;
  handleSaveNode: (nodeId: string, updatedData: any) => void;

  setDrawerOpen: (open: boolean) => void;
  connect: () => void;
}

export function useFlowCanvas(): FlowCanvasState {
  const reactFlowInstance = useReactFlow();

  const [nodes, _setNodes] = useState<Node[]>([]);
  const [edges, _setEdges] = useState<Edge[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const suppressYjsSync = useRef(false);
  const { ydocRef, connectionStatus, connect, disconnect } = useYjsCollaboration(
    DEFAULT_ROOM,
    localStg.get("token") || ""
  );

  // 包装 setNodes，自动同步到 Yjs
  const setNodes = useCallback(
    (value: Node[] | ((prev: Node[]) => Node[])) => {
      _setNodes((prev) => {
        const next = typeof value === "function" ? (value as (prev: Node[]) => Node[])(prev) : value;
        if (ydocRef.current && !suppressYjsSync.current) {
          const yNodes = ydocRef.current.getMap("nodes");
          ydocRef.current.transact(() => {
            const newIds = new Set(next.map((n: Node) => n.id));
            for (const [id] of yNodes) {
              if (!newIds.has(id)) yNodes.delete(id);
            }
            for (const node of next) {
              yNodes.set(node.id, node);
            }
          }, "local");
        }
        suppressYjsSync.current = false;
        return next;
      });
    },
    [ydocRef]
  );

  // 包装 setEdges，自动同步到 Yjs
  const setEdges = useCallback(
    (value: Edge[] | ((prev: Edge[]) => Edge[])) => {
      _setEdges((prev) => {
        const next = typeof value === "function" ? (value as (prev: Edge[]) => Edge[])(prev) : value;
        if (ydocRef.current && !suppressYjsSync.current) {
          const yEdges = ydocRef.current.getMap("edges");
          ydocRef.current.transact(() => {
            const newIds = new Set(next.map((e: Edge) => e.id));
            for (const [id] of yEdges) {
              if (!newIds.has(id)) yEdges.delete(id);
            }
            for (const edge of next) {
              yEdges.set(edge.id, edge);
            }
          }, "local");
        }
        suppressYjsSync.current = false;
        return next;
      });
    },
    [ydocRef]
  );

  // Yjs observer：远程变更同步到本地 state
  useEffect(() => {
    if (!ydocRef.current || connectionStatus !== "connected") return;
    const yNodes = ydocRef.current.getMap("nodes");
    const yEdges = ydocRef.current.getMap("edges");

    const nodesObserver = () => {
      suppressYjsSync.current = true;
      requestAnimationFrame(() => {
        _setNodes(Array.from(yNodes.values()) as Node[]);
      });
    };
    const edgesObserver = () => {
      suppressYjsSync.current = true;
      requestAnimationFrame(() => {
        _setEdges(Array.from(yEdges.values()) as Edge[]);
      });
    };

    yNodes.observe(nodesObserver);
    yEdges.observe(edgesObserver);

    return () => {
      yNodes.unobserve(nodesObserver);
      yEdges.unobserve(edgesObserver);
    };
  }, [ydocRef, connectionStatus]);

  // 用 ref 跟踪最新 nodes/edges
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // 自动连接协同编辑
  useEffect(() => {
    connect();
    const timer = setTimeout(() => {
      if (ydocRef.current) {
        const yNodes = ydocRef.current.getMap<Node>("nodes");
        const yEdges = ydocRef.current.getMap<Edge>("edges");
        ydocRef.current.transact(() => {
          for (const node of nodesRef.current) {
            if (!yNodes.has(node.id)) yNodes.set(node.id, node);
          }
          for (const edge of edgesRef.current) {
            if (!yEdges.has(edge.id)) yEdges.set(edge.id, edge);
          }
        }, "local");
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connect, disconnect, ydocRef]);

  // 从 localStorage 加载数据
  useEffect(() => {
    const savedNodes = localStg.get(STORAGE_KEYS.nodes);
    const savedEdges = localStg.get(STORAGE_KEYS.edges);
    if (savedNodes && Array.isArray(savedNodes)) {
      _setNodes(savedNodes as Node[]);
    }
    if (savedEdges && Array.isArray(savedEdges)) {
      _setEdges(savedEdges as Edge[]);
    }
  }, []);

  // 保存数据到 localStorage
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      localStg.set(STORAGE_KEYS.nodes, nodes as any);
      localStg.set(STORAGE_KEYS.edges, edges as any);
    }
  }, [nodes, edges]);

  // 自定义节点类型
  const customNodeTypes: NodeTypes = useMemo(
    () => ({
      custom: CustomNode,
    }),
    []
  );

  // React Flow 事件处理
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      flushSync(() => {
        setNodes((nds) => applyNodeChanges(changes, nds));
      });
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      flushSync(() => {
        setEdges((eds) => applyEdgeChanges(changes, eds));
      });
    },
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // 节点点击处理
  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      setEditingNode(node);
      setDrawerOpen(true);
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!nodeTypes[type as keyof typeof nodeTypes]) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: "custom",
        position,
        data: {
          label: nodeTypes[type as keyof typeof nodeTypes]!.label,
          nodeType: type,
          onNodeClick: handleNodeClick,
          description: "",
          status: "pending",
          notes: "",
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleNodeClick, setNodes]
  );

  // 布局算法
  const onDagreLayout = useCallback(
    (direction: "TB" | "BT" | "LR" | "RL") => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 100 });

      const nodeWidth = 200;
      const nodeHeight = 80;

      nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
      });
      edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
          ...node,
          position: {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
          },
        };
      });

      setNodes(layoutedNodes);
      requestAnimationFrame(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
      });
    },
    [nodes, edges, reactFlowInstance, setNodes]
  );

  const onGridLayout = useCallback(() => {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const nodeWidth = 200;
    const nodeHeight = 80;
    const spacing = 150;

    const layoutedNodes = nodes.map((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        ...node,
        position: {
          x: col * (nodeWidth + spacing),
          y: row * (nodeHeight + spacing),
        },
      };
    });

    setNodes(layoutedNodes);
    requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    });
  }, [nodes, reactFlowInstance, setNodes]);

  const onCircleLayout = useCallback(() => {
    const radius = Math.max(300, nodes.length * 50);
    const centerX = 0;
    const centerY = 0;

    const layoutedNodes = nodes.map((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      return {
        ...node,
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        },
      };
    });

    setNodes(layoutedNodes);
    requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    });
  }, [nodes, reactFlowInstance, setNodes]);

  // 执行流程
  const handleExecute = useCallback(async () => {
    if (nodes.length === 0) return;

    setIsExecuting(true);
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, status: "pending" },
      }))
    );

    const executionOrder = topologicalSort(nodes, edges);

    for (let i = 0; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      if (!node) continue;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, status: "processing" } } : n
        )
      );

      const stream = mockExecuteNode(executionOrder[i]!);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      await new Promise<void>((resolve) => {
        const readStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === executionOrder[i]!.id
                    ? { ...n, data: { ...n.data, status: "completed" } }
                    : n
                )
              );
              resolve();
              break;
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  console.log(`Node ${executionOrder[i]!.id} progress: ${data.progress}%`);
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
        };
        readStream();
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsExecuting(false);
  }, [nodes, edges, setNodes]);

  // 保存节点编辑
  const handleSaveNode = useCallback(
    (nodeId: string, updatedData: any) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updatedData } }
            : node
        )
      );
    },
    [setNodes]
  );

  // 确保所有现有节点都有 onNodeClick 回调
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, onNodeClick: handleNodeClick },
      }))
    );
  }, [handleNodeClick, setNodes]);

  return {
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
  };
}
