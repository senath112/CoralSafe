
'use client';

import type { FC } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet'; // Import Leaflet library itself

interface MapVisualizationProps {
  latitude: number;
  longitude: number;
  depth: number;
}

// Fix for default marker icon issue with Webpack
// @ts-ignore - This is a known workaround for Leaflet in certain build environments
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


const MapVisualization: FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  // Don't render on the server, Leaflet needs the window object
  if (typeof window === 'undefined') {
    return null;
  }

  const position: [number, number] = [latitude, longitude];
  // Using latitude and longitude in the key forces React to create a new
  // MapContainer instance when the location changes, preventing initialization errors.
  const mapKey = `${latitude}-${longitude}`;

  return (
    <MapContainer
      key={mapKey} // Add key here
      center={position}
      zoom={10}
      style={{ height: '300px', width: '100%', borderRadius: '8px' }}
      scrollWheelZoom={false}
      className="z-0" // Ensure map is behind popups if necessary
      >
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
