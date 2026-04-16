interface SynapseLogoProps {
  className?: string;
  animate?: boolean;
}

interface Node {
  x: number;
  y: number;
  id: string;
}

interface Path {
  from: string;
  to: string;
}

export function SynapseLogo({ className = "", animate = true }: SynapseLogoProps) {
  // Neural network-style letter definitions
  // Nodes positioned to form letter shapes with circuit-like pathways
  const letters: Record<string, { nodes: Node[]; paths: Path[] }> = {
    s: {
      nodes: [
        { x: 32, y: 4, id: "s1" },
        { x: 20, y: 8, id: "s2" },
        { x: 12, y: 16, id: "s3" },
        { x: 20, y: 24, id: "s4" },
        { x: 32, y: 28, id: "s5" },
        { x: 44, y: 32, id: "s6" },
        { x: 36, y: 44, id: "s7" },
        { x: 24, y: 48, id: "s8" },
        { x: 12, y: 44, id: "s9" },
        { x: 6, y: 38, id: "s10" },
      ],
      paths: [
        { from: "s1", to: "s2" },
        { from: "s2", to: "s3" },
        { from: "s3", to: "s4" },
        { from: "s4", to: "s5" },
        { from: "s5", to: "s6" },
        { from: "s6", to: "s7" },
        { from: "s7", to: "s8" },
        { from: "s8", to: "s9" },
        { from: "s9", to: "s10" },
        { from: "s3", to: "s5" },
      ],
    },
    y: {
      nodes: [
        { x: 8, y: 4, id: "y1" },
        { x: 18, y: 16, id: "y2" },
        { x: 28, y: 28, id: "y3" },
        { x: 28, y: 42, id: "y4" },
        { x: 28, y: 52, id: "y5" },
        { x: 48, y: 4, id: "y6" },
        { x: 38, y: 16, id: "y7" },
        { x: 28, y: 28, id: "y8" },
      ],
      paths: [
        { from: "y1", to: "y2" },
        { from: "y2", to: "y3" },
        { from: "y3", to: "y4" },
        { from: "y4", to: "y5" },
        { from: "y6", to: "y7" },
        { from: "y7", to: "y8" },
      ],
    },
    n: {
      nodes: [
        { x: 6, y: 52, id: "n1" },
        { x: 6, y: 36, id: "n2" },
        { x: 6, y: 20, id: "n3" },
        { x: 6, y: 4, id: "n4" },
        { x: 22, y: 20, id: "n5" },
        { x: 34, y: 36, id: "n6" },
        { x: 42, y: 52, id: "n7" },
        { x: 42, y: 36, id: "n8" },
        { x: 42, y: 20, id: "n9" },
        { x: 42, y: 4, id: "n10" },
      ],
      paths: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n4" },
        { from: "n4", to: "n5" },
        { from: "n5", to: "n6" },
        { from: "n6", to: "n7" },
        { from: "n8", to: "n9" },
        { from: "n9", to: "n10" },
        { from: "n3", to: "n9" },
      ],
    },
    a: {
      nodes: [
        { x: 28, y: 4, id: "a1" },
        { x: 18, y: 16, id: "a2" },
        { x: 12, y: 28, id: "a3" },
        { x: 8, y: 40, id: "a4" },
        { x: 6, y: 52, id: "a5" },
        { x: 22, y: 32, id: "a6" },
        { x: 34, y: 32, id: "a7" },
        { x: 38, y: 40, id: "a8" },
        { x: 42, y: 52, id: "a9" },
        { x: 38, y: 28, id: "a10" },
        { x: 32, y: 16, id: "a11" },
      ],
      paths: [
        { from: "a1", to: "a2" },
        { from: "a2", to: "a3" },
        { from: "a3", to: "a4" },
        { from: "a4", to: "a5" },
        { from: "a3", to: "a6" },
        { from: "a6", to: "a7" },
        { from: "a7", to: "a8" },
        { from: "a8", to: "a9" },
        { from: "a7", to: "a10" },
        { from: "a10", to: "a11" },
        { from: "a11", to: "a1" },
      ],
    },
    p: {
      nodes: [
        { x: 8, y: 52, id: "p1" },
        { x: 8, y: 36, id: "p2" },
        { x: 8, y: 20, id: "p3" },
        { x: 8, y: 4, id: "p4" },
        { x: 22, y: 4, id: "p5" },
        { x: 36, y: 8, id: "p6" },
        { x: 40, y: 18, id: "p7" },
        { x: 36, y: 28, id: "p8" },
        { x: 22, y: 32, id: "p9" },
        { x: 8, y: 32, id: "p10" },
      ],
      paths: [
        { from: "p1", to: "p2" },
        { from: "p2", to: "p3" },
        { from: "p3", to: "p4" },
        { from: "p4", to: "p5" },
        { from: "p5", to: "p6" },
        { from: "p6", to: "p7" },
        { from: "p7", to: "p8" },
        { from: "p8", to: "p9" },
        { from: "p9", to: "p10" },
        { from: "p5", to: "p9" },
      ],
    },
    e: {
      nodes: [
        { x: 36, y: 8, id: "e1" },
        { x: 24, y: 4, id: "e2" },
        { x: 12, y: 8, id: "e3" },
        { x: 6, y: 20, id: "e4" },
        { x: 6, y: 32, id: "e5" },
        { x: 6, y: 44, id: "e6" },
        { x: 12, y: 52, id: "e7" },
        { x: 24, y: 56, id: "e8" },
        { x: 36, y: 52, id: "e9" },
        { x: 12, y: 28, id: "e10" },
        { x: 32, y: 28, id: "e11" },
      ],
      paths: [
        { from: "e1", to: "e2" },
        { from: "e2", to: "e3" },
        { from: "e3", to: "e4" },
        { from: "e4", to: "e5" },
        { from: "e5", to: "e6" },
        { from: "e6", to: "e7" },
        { from: "e7", to: "e8" },
        { from: "e8", to: "e9" },
        { from: "e4", to: "e10" },
        { from: "e10", to: "e11" },
      ],
    },
  };

  const word = "synapse";
  const letterWidth = 54;
  const letterSpacing = 4;

  const renderLetter = (letter: string, letterIndex: number) => {
    const letterData = letters[letter];
    if (!letterData) return null;

    const { nodes, paths } = letterData;
    const totalLetters = word.length;
    const baseDelay = letterIndex * 80;

    // Calculate color intensity based on position (left to right fade)
    const positionRatio = letterIndex / (totalLetters - 1);
    const minOpacity = 0.45;
    const maxOpacity = 1;
    const opacity = minOpacity + (maxOpacity - minOpacity) * positionRatio;

    return (
      <svg
        key={`${letter}-${letterIndex}`}
        width={letterWidth}
        height="60"
        viewBox="0 0 54 60"
        className="synapse-letter-svg"
        style={{
          marginRight: letterIndex < totalLetters - 1 ? letterSpacing : 0,
        }}
      >
        <defs>
          <filter id={`glow-${letter}-${letterIndex}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Render paths (connections) */}
        {paths.map((path, pathIndex) => {
          const fromNode = nodes.find((n) => n.id === path.from);
          const toNode = nodes.find((n) => n.id === path.to);
          if (!fromNode || !toNode) return null;

          return (
            <line
              key={`${letter}-path-${pathIndex}`}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={opacity * 0.7}
              className={animate ? "synapse-path" : ""}
              style={{
                transitionDelay: animate ? `${baseDelay + pathIndex * 15}ms` : undefined,
              }}
            />
          );
        })}

        {/* Render nodes */}
        {nodes.map((node, nodeIndex) => (
          <g key={node.id}>
            {/* Outer glow ring */}
            <circle
              cx={node.x}
              cy={node.y}
              r="4"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity={opacity * 0.2}
              className={animate ? "synapse-node-ring" : ""}
              style={{
                transitionDelay: animate ? `${baseDelay + nodeIndex * 20}ms` : undefined,
              }}
            />
            {/* Main node */}
            <circle
              cx={node.x}
              cy={node.y}
              r="2.5"
              fill="currentColor"
              opacity={opacity}
              className={animate ? "synapse-node" : ""}
              style={{
                transitionDelay: animate ? `${baseDelay + nodeIndex * 20}ms` : undefined,
              }}
            />
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div
      className={`synapse-logo ${className}`}
      data-animated={animate}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        cursor: "default",
        userSelect: "none",
        WebkitUserSelect: "none",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="synapse-logo-inner"
        style={{
          display: "flex",
          alignItems: "center",
          transition: "transform 0.3s cubic-bezier(0.19, 1, 0.22, 1), filter 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.03)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {word.split("").map((letter, index) => renderLetter(letter, index))}
      </div>
    </div>
  );
}
