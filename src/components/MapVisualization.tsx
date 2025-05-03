
'use client';

import type { FC } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { type Map } from 'leaflet'; // Import Map type from leaflet
import { useEffect, useState, useRef } from 'react'; // Added useRef

interface MapVisualizationProps {
  latitude: number;
  longitude: number;
  depth: number;
}

// Fix for default marker icon issue with Webpack
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Component to update map view when props change
const ChangeView: FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};


const MapVisualization: FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<Map | null>(null); // Ref to store map instance

  useEffect(() => {
    setIsClient(true); // Will only run on client after mount

    // Cleanup function to remove map instance on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null; // Important to nullify the ref
        console.log("Leaflet map removed");
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount and unmount

  // Render placeholder on server OR before client-side mount
  if (!isClient) {
    return <div style={{ height: '300px', width: '100%', background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'hsl(var(--muted-foreground))' }}>Loading map...</div>;
  }

  // Render map only on the client
  const position: [number, number] = [latitude, longitude];
  const zoomLevel = 10;

  return (
    <div style={{ height: '300px', width: '100%' }}>
      {/* Conditionally render MapContainer to ensure it's only created once */}
      {/* Use a key based on lat/lon if you need it to re-render on location change, but this might re-trigger the error */}
      {/* A better approach is using ChangeView component inside */}
      <MapContainer
        center={position}
        zoom={zoomLevel}
        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={false}
        className="z-0" // Ensure z-index doesn't interfere
        whenCreated={(mapInstance) => { mapRef.current = mapInstance; }} // Store map instance
      >
        <ChangeView center={position} zoom={zoomLevel} /> {/* Use this to update view */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            Location: ({latitude.toFixed(4)}, {longitude.toFixed(4)})<br />
            Depth: {depth}m
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default MapVisualization;
