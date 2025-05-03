
'use client';

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DepthVisualizationProps {
  depth: number;
}

const DepthVisualization: React.FC<DepthVisualizationProps> = ({ depth }) => {
  const ref = useRef<SVGSVGElement>(null);
  const width = 200;
  const height = 300;
  const maxDepth = 50; // Assume a max depth for scaling, adjust as needed

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove(); // Clear previous drawings

    // Scale depth to height of the cone (triangle)
    const coneHeight = Math.min(height * 0.8, (depth / maxDepth) * (height * 0.8));
    const coneBaseWidth = coneHeight * 0.5; // Make base proportional to height

    const points: [number, number][] = [
      [width / 2, height * 0.1], // Tip of the cone (top center)
      [width / 2 - coneBaseWidth / 2, height * 0.1 + coneHeight], // Bottom left
      [width / 2 + coneBaseWidth / 2, height * 0.1 + coneHeight], // Bottom right
    ];

    // Create a gradient for a simple 3D effect
    const gradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "coneGradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "hsl(var(--primary) / 0.6)"); // Lighter edge

    gradient.append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "hsl(var(--primary))"); // Main color

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "hsl(var(--primary) / 0.8)"); // Darker edge

    // Draw the cone (triangle)
    svg.append('polygon')
      .attr('points', points.map(p => p.join(",")).join(" "))
      .attr('fill', 'url(#coneGradient)')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 1);

    // Add depth label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height * 0.95)
      .attr('text-anchor', 'middle')
      .attr('fill', 'hsl(var(--foreground))')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text(`Depth: ${depth.toFixed(1)}m`);

  }, [depth, height, width]);

  return (
    <div className="flex justify-center items-center w-full h-full">
       <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`}></svg>
    </div>

  );
};

export default DepthVisualization;
