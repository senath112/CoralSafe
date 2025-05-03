
'use client';

import type { FC } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react'; // Added useState

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

  useEffect(() => {
    setIsClient(true); // Will only run on client after mount
  }, []);

  // Render placeholder on server OR before client-side mount
  if (!isClient) {
    return <div style={{ height: '300px', width: '100%', background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'hsl(var(--muted-foreground))' }}>Loading map...</div>;
  }

  // Render map only on the client
  const position: [number, number] = [latitude, longitude];
  const zoomLevel = 10;

  return (
    <MapContainer
      center={position}
      zoom={zoomLevel}
      style={{ height: '300px', width: '100%', borderRadius: '8px' }}
      scrollWheelZoom={false}
      className="z-0" // Ensure z-index doesn't interfere
    >
      <ChangeView center={position} zoom={zoomLevel} /> {/* Add this component */}
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
  );
};

export default MapVisualization;
