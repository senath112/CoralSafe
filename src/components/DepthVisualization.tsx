'use client';

import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface DepthVisualizationProps {
  depth: number;
}

const DepthVisualization: React.FC<DepthVisualizationProps> = ({ depth }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [rotationZ, setRotationZ] = useState(0); // State for Z-axis rotation

  const width = 200;
  const height = 300;
  const maxDepthScale = 50; // Fixed scale representing 0m to 50m
  const coneTopMargin = height * 0.1; // Margin from SVG top
  const coneBottomMargin = height * 0.1; // Margin from SVG bottom
  const coneMaxHeight = height - coneTopMargin - coneBottomMargin; // Max visual height of the cone
  const coneBaseWidth = coneMaxHeight * 0.4; // Adjust base width proportion if needed
  const coneCenterX = width / 2;
  const coneCenterY = coneTopMargin + coneMaxHeight / 2; // Visual center Y of the cone part

  useEffect(() => {
    if (!ref.current || depth === undefined || depth === null) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove(); // Clear previous drawings

    // --- Create a group for all cone elements to rotate together ---
    const coneGroup = svg.append('g')
      .attr('transform', `rotate(${rotationZ}, ${coneCenterX}, ${coneCenterY})`); // Apply rotation

    // --- Cone representing 0m to 50m depth ---
    const points: [number, number][] = [
      [coneCenterX, height - coneBottomMargin], // Tip of the cone (bottom center, representing 50m)
      [coneCenterX - coneBaseWidth / 2, coneTopMargin], // Top left base (representing 0m)
      [coneCenterX + coneBaseWidth / 2, coneTopMargin], // Top right base (representing 0m)
    ];

    // --- Depth-based Color Gradient ---
    const gradient = svg.append("defs") // Define gradient outside the rotating group
      .append("linearGradient")
      .attr("id", "depthGradient")
      .attr("x1", "0%")
      .attr("x2", "0%") // Vertical gradient
      .attr("y1", "0%") // Starts at the top (0m)
      .attr("y2", "100%"); // Ends at the bottom (50m)

    // Gradient reflecting coral health vs depth
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "hsl(180, 70%, 60%)"); // Light Blue/Cyan
    gradient.append("stop").attr("offset", "25%").attr("stop-color", "hsl(120, 60%, 50%)"); // Green
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "hsl(45, 90%, 55%)"); // Yellow/Orange
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "hsl(0, 70%, 50%)"); // Red

    // Draw the inverted cone inside the group
    coneGroup.append('polygon')
      .attr('points', points.map(p => p.join(",")).join(" "))
      .attr('fill', 'url(#depthGradient)')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 1);

    // --- Depth Marker ---
    const clampedDepth = Math.max(0, Math.min(depth, maxDepthScale));
    const markerY = coneTopMargin + (clampedDepth / maxDepthScale) * coneMaxHeight;
    const markerWidth = coneBaseWidth * (1 - (clampedDepth / maxDepthScale));
    const markerX1 = coneCenterX - markerWidth / 2;
    const markerX2 = coneCenterX + markerWidth / 2;

    // Draw the marker line (BLACK STROKE) inside the group
    coneGroup.append('line')
      .attr('x1', markerX1)
      .attr('y1', markerY)
      .attr('x2', markerX2)
      .attr('y2', markerY)
      .attr('stroke', 'black') // Use black stroke
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '4 2');

    // Add depth label next to the marker line inside the group
    coneGroup.append('text')
      .attr('x', markerX2 + 6) // Position slightly to the right of the line
      .attr('y', markerY)
      .attr('dy', '0.35em') // Vertically center text
      .attr('text-anchor', 'start')
      .attr('fill', 'hsl(var(--foreground))') // Use theme foreground for text
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text(`${clampedDepth.toFixed(1)}m`);

     // Add 0m label at the top inside the group
     coneGroup.append('text')
       .attr('x', coneCenterX + coneBaseWidth / 2 + 5)
       .attr('y', coneTopMargin)
       .attr('dy', '0.35em')
       .attr('text-anchor', 'start')
       .attr('fill', 'hsl(var(--foreground)/0.7)')
       .style('font-size', '10px')
       .text('0m');

     // Add 50m label at the bottom inside the group
     coneGroup.append('text')
       .attr('x', coneCenterX + 5)
       .attr('y', height - coneBottomMargin)
       .attr('dy', '0.35em')
       .attr('text-anchor', 'start')
       .attr('fill', 'hsl(var(--foreground)/0.7)')
       .style('font-size', '10px')
       .text(`${maxDepthScale}m`);

    // --- Drag behavior for rotation ---
    let startRotation = rotationZ; // Capture rotation at drag start

    const dragHandler = d3.drag<SVGSVGElement, unknown>()
      .on('start', () => {
        startRotation = rotationZ; // Update start rotation when drag begins
        svg.style('cursor', 'grabbing');
      })
      .on('drag', (event) => {
        // Rotate based on horizontal movement (dx)
        // Adjust sensitivity by multiplying dx
        const sensitivity = 0.5;
        const newRotation = startRotation + event.dx * sensitivity;
        setRotationZ(newRotation); // Update state to trigger re-render
      })
      .on('end', () => {
        svg.style('cursor', 'grab');
      });

    // Apply drag handler to the SVG element
    svg.call(dragHandler).style('cursor', 'grab');

  }, [depth, height, width, coneMaxHeight, coneBaseWidth, coneTopMargin, coneBottomMargin, rotationZ, coneCenterX, coneCenterY]); // Include rotationZ and center coordinates

  return (
    <div className="flex justify-center items-center w-full h-full">
       {/* Ensure SVG has a defined size */}
       <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`}></svg>
    </div>
  );
};

export default DepthVisualization;
