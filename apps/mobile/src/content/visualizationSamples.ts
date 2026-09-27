import type { VisualizationSpec } from "@thinketh/contracts";

// QA fixtures for the dev-only Visualize gallery: the live planner's output (Claude, 2026-09-26)
// for the seven acceptance topics, kept verbatim so layout and animation can be checked for every
// grammar without spending a model call. Not shown to learners.

export const VISUALIZATION_SAMPLES: { key: string; label: string; spec: VisualizationSpec }[] = [
  { key: "before-after", label: "Before / after", spec: {
  "kind": "visualization",
  "visualizationType": "transformation",
  "title": "Dropping the caption stage",
  "subtitle": "How image understanding moved from a two-step relay to a single pass.",
  "sections": [
    {
      "id": "before",
      "label": "Caption pipeline",
      "caption": "Image becomes text, then text is reasoned over.",
      "tone": "before",
      "nodeIds": [
        "img-old",
        "captioner",
        "caption",
        "reasoner-old"
      ]
    },
    {
      "id": "now",
      "label": "Native multimodal",
      "caption": "Image and text enter the same model together.",
      "tone": "now",
      "nodeIds": [
        "img-new",
        "mm-model",
        "answer-new"
      ]
    }
  ],
  "nodes": [
    {
      "id": "img-old",
      "label": "Image",
      "icon": "image",
      "emphasis": "normal"
    },
    {
      "id": "captioner",
      "label": "Caption model",
      "description": "Separate stage",
      "icon": "model",
      "emphasis": "muted"
    },
    {
      "id": "caption",
      "label": "Caption text",
      "description": "Only what words captured",
      "icon": "text",
      "emphasis": "muted"
    },
    {
      "id": "reasoner-old",
      "label": "Text reasoner",
      "description": "Never sees the image",
      "icon": "brain",
      "emphasis": "normal"
    },
    {
      "id": "img-new",
      "label": "Image + text",
      "description": "Both given at once",
      "icon": "image",
      "emphasis": "primary"
    },
    {
      "id": "mm-model",
      "label": "Multimodal model",
      "description": "One pass, shared representation",
      "icon": "model",
      "emphasis": "primary"
    },
    {
      "id": "answer-new",
      "label": "Answer",
      "icon": "answer",
      "emphasis": "primary"
    }
  ],
  "edges": [
    {
      "from": "img-old",
      "to": "captioner",
      "relationship": "feeds_into",
      "emphasis": "normal"
    },
    {
      "from": "captioner",
      "to": "caption",
      "relationship": "becomes",
      "emphasis": "normal"
    },
    {
      "from": "caption",
      "to": "reasoner-old",
      "relationship": "feeds_into",
      "label": "text only",
      "emphasis": "normal"
    },
    {
      "from": "img-new",
      "to": "mm-model",
      "relationship": "feeds_into",
      "emphasis": "primary"
    },
    {
      "from": "mm-model",
      "to": "answer-new",
      "relationship": "returns",
      "emphasis": "primary"
    }
  ],
  "callouts": [
    {
      "text": "Nothing is flattened into words before reasoning starts.",
      "targetNodeId": "mm-model"
    }
  ],
  "takeawayLabel": "The shift",
  "takeaway": "The caption was an intermediate translation, and whatever it left out was gone. Native multimodal models reason over image and text jointly, so that bottleneck disappears.",
  "source": "model"
} },
  { key: "process", label: "Process", spec: {
  "kind": "visualization",
  "visualizationType": "process",
  "title": "Retrieve, then generate",
  "subtitle": "A query becomes a search, and the search result becomes the prompt.",
  "sections": [],
  "nodes": [
    {
      "id": "query",
      "label": "Your question",
      "description": "Plain text query",
      "icon": "message",
      "emphasis": "normal"
    },
    {
      "id": "embedding",
      "label": "Query embedding",
      "description": "Question turned into a vector",
      "icon": "model",
      "emphasis": "normal"
    },
    {
      "id": "index",
      "label": "Document index",
      "description": "Searchable store of passages",
      "icon": "database",
      "emphasis": "normal"
    },
    {
      "id": "passages",
      "label": "Top passages",
      "description": "Most relevant text found",
      "icon": "document",
      "emphasis": "primary"
    },
    {
      "id": "prompt",
      "label": "Augmented prompt",
      "description": "Question plus retrieved passages",
      "icon": "text",
      "emphasis": "primary"
    },
    {
      "id": "answer",
      "label": "Grounded answer",
      "description": "Generated from those passages",
      "icon": "answer",
      "emphasis": "primary"
    }
  ],
  "edges": [
    {
      "from": "query",
      "to": "embedding",
      "relationship": "becomes",
      "label": "embedded",
      "emphasis": "normal"
    },
    {
      "from": "embedding",
      "to": "index",
      "relationship": "uses",
      "label": "searches",
      "emphasis": "normal"
    },
    {
      "from": "index",
      "to": "passages",
      "relationship": "returns",
      "label": "retrieves",
      "emphasis": "primary"
    },
    {
      "from": "passages",
      "to": "prompt",
      "relationship": "feeds_into",
      "label": "added to prompt",
      "emphasis": "primary"
    },
    {
      "from": "prompt",
      "to": "answer",
      "relationship": "enables",
      "label": "generation",
      "emphasis": "primary"
    }
  ],
  "callouts": [
    {
      "text": "The prompt is where retrieval and generation meet.",
      "targetNodeId": "prompt"
    }
  ],
  "takeawayLabel": "The order",
  "takeaway": "Search runs first, and its results are pasted into the prompt. The model then writes an answer bounded by those passages.",
  "source": "model"
} },
  { key: "system", label: "System", spec: {
  "kind": "visualization",
  "visualizationType": "system",
  "title": "The agent's working desk",
  "subtitle": "Context is where thinking happens; tools and memory sit outside it.",
  "sections": [],
  "nodes": [
    {
      "id": "model",
      "label": "Model",
      "description": "Reasons over what is in context",
      "icon": "model",
      "emphasis": "normal"
    },
    {
      "id": "context",
      "label": "Context window",
      "description": "The agent's working space",
      "icon": "screen",
      "emphasis": "primary"
    },
    {
      "id": "tools",
      "label": "External tools",
      "description": "Called, then results read back",
      "icon": "tool",
      "emphasis": "normal"
    },
    {
      "id": "memory",
      "label": "Memory store",
      "description": "Durable facts kept across turns",
      "icon": "memory",
      "emphasis": "normal"
    }
  ],
  "edges": [
    {
      "from": "context",
      "to": "model",
      "relationship": "feeds_into",
      "label": "what it can see",
      "emphasis": "primary"
    },
    {
      "from": "model",
      "to": "tools",
      "relationship": "uses",
      "label": "calls",
      "emphasis": "normal"
    },
    {
      "from": "tools",
      "to": "context",
      "relationship": "returns",
      "label": "results",
      "emphasis": "primary"
    },
    {
      "from": "model",
      "to": "memory",
      "relationship": "feeds_into",
      "label": "writes facts",
      "emphasis": "normal"
    },
    {
      "from": "memory",
      "to": "context",
      "relationship": "returns",
      "label": "recalls",
      "emphasis": "primary"
    }
  ],
  "callouts": [
    {
      "text": "Everything the agent uses must first arrive here.",
      "targetNodeId": "context"
    }
  ],
  "takeawayLabel": "The core idea",
  "takeaway": "The model only ever acts on its context window. Tools and memory matter because their outputs are written back into it.",
  "source": "model"
} },
  { key: "causal", label: "Causal", spec: {
  "kind": "visualization",
  "visualizationType": "causal_chain",
  "title": "The cost of a long context",
  "subtitle": "More tokens in the prompt means more attention work per request.",
  "sections": [],
  "nodes": [
    {
      "id": "long-context",
      "label": "Longer context",
      "description": "More tokens in the prompt",
      "icon": "document",
      "emphasis": "primary"
    },
    {
      "id": "attention",
      "label": "Attention work",
      "description": "Grows with token count",
      "icon": "model",
      "emphasis": "primary"
    },
    {
      "id": "compute",
      "label": "Compute and memory",
      "description": "More work held per request",
      "icon": "database",
      "emphasis": "primary"
    },
    {
      "id": "price",
      "label": "Higher price",
      "description": "Providers bill input tokens",
      "icon": "cost",
      "emphasis": "normal"
    },
    {
      "id": "latency",
      "label": "Slower response",
      "description": "More work before the answer",
      "icon": "clock",
      "emphasis": "normal"
    }
  ],
  "edges": [
    {
      "from": "long-context",
      "to": "attention",
      "relationship": "causes",
      "label": "more tokens to attend over",
      "emphasis": "primary"
    },
    {
      "from": "attention",
      "to": "compute",
      "relationship": "causes",
      "label": "per request",
      "emphasis": "primary"
    },
    {
      "from": "compute",
      "to": "price",
      "relationship": "causes",
      "label": "billed by input tokens",
      "emphasis": "normal"
    },
    {
      "from": "compute",
      "to": "latency",
      "relationship": "causes",
      "label": "longer to finish",
      "emphasis": "normal"
    }
  ],
  "callouts": [
    {
      "text": "The cost starts here, not at the answer.",
      "targetNodeId": "attention"
    }
  ],
  "takeawayLabel": "Why it matters",
  "takeaway": "Context length is a cost lever. Every token you leave in the prompt is paid for in compute, price and waiting time.",
  "source": "model"
} },
  { key: "hierarchy", label: "Hierarchy", spec: {
  "kind": "visualization",
  "visualizationType": "hierarchy",
  "title": "Inside a Language Model",
  "subtitle": "The same structure, seen at three levels of zoom.",
  "sections": [],
  "nodes": [
    {
      "id": "model",
      "label": "Language model",
      "description": "Defined by its architecture",
      "icon": "model",
      "emphasis": "primary"
    },
    {
      "id": "transformer",
      "label": "Transformer architecture",
      "description": "Stacked layers",
      "icon": "network",
      "emphasis": "primary"
    },
    {
      "id": "embeddings",
      "label": "Embeddings",
      "description": "At the input",
      "icon": "text",
      "emphasis": "normal"
    },
    {
      "id": "layer",
      "label": "One layer",
      "description": "Repeated many times",
      "icon": "loop",
      "emphasis": "primary"
    },
    {
      "id": "attention",
      "label": "Attention",
      "icon": "search",
      "emphasis": "normal"
    },
    {
      "id": "ffn",
      "label": "Feed-forward network",
      "icon": "tool",
      "emphasis": "normal"
    }
  ],
  "edges": [
    {
      "from": "model",
      "to": "transformer",
      "relationship": "contains",
      "label": "is defined by",
      "emphasis": "primary"
    },
    {
      "from": "transformer",
      "to": "embeddings",
      "relationship": "contains",
      "label": "input",
      "emphasis": "normal"
    },
    {
      "from": "transformer",
      "to": "layer",
      "relationship": "contains",
      "label": "stacks",
      "emphasis": "primary"
    },
    {
      "from": "layer",
      "to": "attention",
      "relationship": "contains",
      "emphasis": "primary"
    },
    {
      "from": "layer",
      "to": "ffn",
      "relationship": "contains",
      "emphasis": "primary"
    }
  ],
  "callouts": [
    {
      "text": "This small pair is what gets repeated all the way up.",
      "targetNodeId": "layer"
    }
  ],
  "takeawayLabel": "The structure",
  "takeaway": "A model is its architecture; a transformer architecture is a stack of identical layers. Each layer holds attention and a feed-forward network, with embeddings entering at the bottom.",
  "source": "model"
} },
  { key: "convergence", label: "Convergence", spec: {
  "kind": "visualization",
  "visualizationType": "convergence",
  "title": "Three inputs, one reasoning space",
  "subtitle": "Text, image and audio meet in a shared representation before any answer is formed.",
  "sections": [],
  "nodes": [
    {
      "id": "text-in",
      "label": "Text",
      "description": "Words, prompts, documents",
      "icon": "text",
      "emphasis": "normal"
    },
    {
      "id": "image-in",
      "label": "Image",
      "description": "Pictures, screens, diagrams",
      "icon": "image",
      "emphasis": "normal"
    },
    {
      "id": "audio-in",
      "label": "Audio",
      "description": "Speech and sound",
      "icon": "audio",
      "emphasis": "normal"
    },
    {
      "id": "encoder",
      "label": "Encoding",
      "description": "Each modality converted to vectors",
      "icon": "tool",
      "emphasis": "normal"
    },
    {
      "id": "shared",
      "label": "Shared representation",
      "description": "One common space for all inputs",
      "icon": "network",
      "emphasis": "primary"
    },
    {
      "id": "model",
      "label": "Single model",
      "description": "Reasons across modalities at once",
      "icon": "model",
      "emphasis": "primary"
    },
    {
      "id": "answer",
      "label": "One answer",
      "icon": "answer",
      "emphasis": "normal"
    }
  ],
  "edges": [
    {
      "from": "text-in",
      "to": "encoder",
      "relationship": "feeds_into",
      "emphasis": "normal"
    },
    {
      "from": "image-in",
      "to": "encoder",
      "relationship": "feeds_into",
      "emphasis": "normal"
    },
    {
      "from": "audio-in",
      "to": "encoder",
      "relationship": "feeds_into",
      "emphasis": "normal"
    },
    {
      "from": "encoder",
      "to": "shared",
      "relationship": "becomes",
      "label": "same space",
      "emphasis": "primary"
    },
    {
      "from": "shared",
      "to": "model",
      "relationship": "enables",
      "label": "joint reasoning",
      "emphasis": "primary"
    },
    {
      "from": "model",
      "to": "answer",
      "relationship": "returns",
      "emphasis": "normal"
    }
  ],
  "callouts": [
    {
      "text": "The convergence happens here, before reasoning starts.",
      "targetNodeId": "shared"
    }
  ],
  "takeawayLabel": "The convergence",
  "takeaway": "Multimodality is not three models stitched together. The modalities merge into one representation, and a single model reasons over all of it to produce one answer.",
  "source": "model"
} },
  { key: "cycle", label: "Cycle", spec: {
  "kind": "visualization",
  "visualizationType": "cycle",
  "title": "The Agent Loop",
  "subtitle": "Four steps that repeat until the task is done.",
  "sections": [],
  "nodes": [
    {
      "id": "observe",
      "label": "Observe",
      "description": "Read the current environment",
      "icon": "search",
      "emphasis": "primary"
    },
    {
      "id": "reason",
      "label": "Reason",
      "description": "Decide the next move",
      "icon": "brain",
      "emphasis": "primary"
    },
    {
      "id": "act",
      "label": "Act",
      "description": "Call a tool",
      "icon": "tool",
      "emphasis": "primary"
    },
    {
      "id": "result",
      "label": "Result",
      "description": "Tool returns an outcome",
      "icon": "answer",
      "emphasis": "normal"
    }
  ],
  "edges": [
    {
      "from": "observe",
      "to": "reason",
      "relationship": "feeds_into",
      "emphasis": "primary"
    },
    {
      "from": "reason",
      "to": "act",
      "relationship": "enables",
      "emphasis": "primary"
    },
    {
      "from": "act",
      "to": "result",
      "relationship": "returns",
      "emphasis": "normal"
    },
    {
      "from": "result",
      "to": "observe",
      "relationship": "repeats",
      "label": "observe again",
      "emphasis": "primary"
    }
  ],
  "callouts": [
    {
      "text": "The result becomes the next observation.",
      "targetNodeId": "result"
    }
  ],
  "takeawayLabel": "The loop",
  "takeaway": "Each action changes the environment, so the agent observes again before reasoning. The cycle, not any single step, is what makes it an agent.",
  "source": "model"
} },
];
