
'use client';

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DepthVisualizationProps {
  depth: number;
  suitabilityIndex?: number; // Add suitability index prop
}

const DepthVisualization: React.FC<DepthVisualizationProps> = ({ depth, suitabilityIndex }) => {
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

    // Invert the cone points (tip at the bottom center, base at the top)
    const points: [number, number][] = [
      [width / 2, height * 0.9], // Tip of the cone (bottom center)
      [width / 2 - coneBaseWidth / 2, height * 0.9 - coneHeight], // Top left base
      [width / 2 + coneBaseWidth / 2, height * 0.9 - coneHeight], // Top right base
    ];

    // Determine fill color based on suitability index
    let fillColor = 'hsl(var(--muted-foreground))'; // Default gray if index is undefined
    if (suitabilityIndex !== undefined) {
      if (suitabilityIndex >= 80) {
        fillColor = 'hsl(120, 60%, 50%)'; // Green for ideal
      } else if (suitabilityIndex >= 50) {
        fillColor = 'hsl(45, 100%, 50%)'; // Yellow for caution
      } else {
        fillColor = 'hsl(0, 70%, 50%)'; // Red for threatening
      }
    }

    // Create a gradient for a simple 3D effect using the determined fill color
    const gradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "coneGradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    // Adjust gradient stops based on the base fillColor
    const colorInterpolator = d3.interpolateRgb(fillColor, d3.rgb(fillColor).darker(0.5).toString());

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", d3.rgb(fillColor).brighter(0.5).toString()); // Lighter edge

    gradient.append("stop")
      .attr("offset", "50%")
      .attr("stop-color", fillColor); // Main color

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", d3.rgb(fillColor).darker(0.3).toString()); // Darker edge


    // Draw the inverted cone (triangle)
    svg.append('polygon')
      .attr('points', points.map(p => p.join(",")).join(" "))
      .attr('fill', 'url(#coneGradient)')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 1);

    // Add depth label below the cone tip
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height * 0.95) // Position below the tip
      .attr('text-anchor', 'middle')
      .attr('fill', 'hsl(var(--foreground))')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text(`Depth: ${depth.toFixed(1)}m`);

  }, [depth, height, width, suitabilityIndex]); // Add suitabilityIndex to dependency array

  return (
    <div className="flex justify-center items-center w-full h-full">
       <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`}></svg>
    </div>

  );
};

export default DepthVisualization;
