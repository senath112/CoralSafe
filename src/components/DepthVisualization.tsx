
'use client';

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DepthVisualizationProps {
  depth: number;
  // suitabilityIndex is no longer needed for cone color, but can be kept if used elsewhere
}

const DepthVisualization: React.FC<DepthVisualizationProps> = ({ depth }) => {
  const ref = useRef<SVGSVGElement>(null);
  const width = 200;
  const height = 300;
  const maxDepthScale = 50; // Fixed scale representing 0m to 50m
  const coneTopMargin = height * 0.1; // Margin from SVG top
  const coneBottomMargin = height * 0.1; // Margin from SVG bottom
  const coneMaxHeight = height - coneTopMargin - coneBottomMargin; // Max visual height of the cone
  // Calculate coneBaseWidth outside useEffect
  const coneBaseWidth = coneMaxHeight * 0.4; // Adjust base width proportion if needed

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove(); // Clear previous drawings

    // --- Cone representing 0m to 50m depth ---

    // Inverted cone points (tip at the bottom center, base at the top)
    const points: [number, number][] = [
      [width / 2, height - coneBottomMargin], // Tip of the cone (bottom center, representing 50m)
      [width / 2 - coneBaseWidth / 2, coneTopMargin], // Top left base (representing 0m)
      [width / 2 + coneBaseWidth / 2, coneTopMargin], // Top right base (representing 0m)
    ];

    // --- Depth-based Color Gradient ---
    const gradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "depthGradient")
      .attr("x1", "0%")
      .attr("x2", "0%") // Vertical gradient
      .attr("y1", "0%") // Starts at the top (0m)
      .attr("y2", "100%"); // Ends at the bottom (50m)

    // Green (healthy) at the top (0m), fading to yellow/orange, then red (less healthy) at the bottom (50m)
    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "hsl(120, 70%, 50%)"); // Green at 0m

    gradient.append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "hsl(45, 100%, 50%)"); // Yellow around 25m

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "hsl(0, 70%, 50%)"); // Red at 50m

    // Draw the inverted cone with the depth gradient
    svg.append('polygon')
      .attr('points', points.map(p => p.join(",")).join(" "))
      .attr('fill', 'url(#depthGradient)')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 1);

    // --- Depth Marker ---
    // Clamp input depth to be within 0 and maxDepthScale
    const clampedDepth = Math.max(0, Math.min(depth, maxDepthScale));

    // Calculate the vertical position (y-coordinate) for the marker
    // Linear interpolation: y = top + (depth / maxDepth) * coneHeight
    const markerY = coneTopMargin + (clampedDepth / maxDepthScale) * coneMaxHeight;

    // Calculate the width of the cone at the marker's Y position for line endpoints
    // Linear interpolation for width: widthAtY = baseWidth * (1 - (depth / maxDepth))
    const markerWidth = coneBaseWidth * (1 - (clampedDepth / maxDepthScale));
    const markerX1 = width / 2 - markerWidth / 2;
    const markerX2 = width / 2 + markerWidth / 2;

    // Draw the marker line
    svg.append('line')
      .attr('x1', markerX1)
      .attr('y1', markerY)
      .attr('x2', markerX2)
      .attr('y2', markerY)
      .attr('stroke', 'hsl(var(--foreground))') // Use foreground color for visibility
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 2'); // Make it dashed

    // Add depth label next to the marker line
    svg.append('text')
      .attr('x', markerX2 + 5) // Position slightly to the right of the line
      .attr('y', markerY)
      .attr('dy', '0.35em') // Vertically center text
      .attr('text-anchor', 'start')
      .attr('fill', 'hsl(var(--foreground))')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text(`${clampedDepth.toFixed(1)}m`);

     // Add 0m label at the top
     svg.append('text')
       .attr('x', width / 2 + coneBaseWidth / 2 + 5)
       .attr('y', coneTopMargin)
       .attr('dy', '0.35em')
       .attr('text-anchor', 'start')
       .attr('fill', 'hsl(var(--foreground)/0.7)')
       .style('font-size', '10px')
       .text('0m');

     // Add 50m label at the bottom
     svg.append('text')
       .attr('x', width / 2 + 5)
       .attr('y', height - coneBottomMargin)
       .attr('dy', '0.35em')
       .attr('text-anchor', 'start')
       .attr('fill', 'hsl(var(--foreground)/0.7)')
       .style('font-size', '10px')
       .text(`${maxDepthScale}m`);


  }, [depth, height, width, coneMaxHeight, coneBaseWidth, coneTopMargin, coneBottomMargin]); // Include coneBaseWidth here now

  return (
    <div className="flex justify-center items-center w-full h-full">
       <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`}></svg>
    </div>
  );
};

export default DepthVisualization;
