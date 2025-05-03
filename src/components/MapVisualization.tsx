
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
     if (map) { // Check if map instance exists before calling setView
        map.setView(center, zoom);
     }
  }, [center, zoom, map]);
  return null;
};


const MapVisualization: FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    // Ensure this runs only on the client after the initial render
    setIsClient(true);

    // Cleanup function: This will be called when the component unmounts.
    return () => {
      if (mapRef.current) {
        mapRef.current.remove(); // Properly remove the Leaflet map instance
        mapRef.current = null;   // Clear the ref
        console.log("Leaflet map instance removed on unmount cleanup.");
      }
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount and cleanup on unmount

  // Render placeholder on server OR before client-side mount is complete
  if (!isClient) {
    return (
        <div style={{
            height: '300px',
            width: '100%',
            background: 'hsl(var(--muted))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            color: 'hsl(var(--muted-foreground))'
         }}>
            Loading map...
        </div>
    );
  }

  // Render map only on the client
  const position: [number, number] = [latitude, longitude];
  const zoomLevel = 10;

  return (
    <div style={{ height: '300px', width: '100%' }}>
      {/* MapContainer is rendered only when isClient is true */}
      {isClient && (
         <MapContainer
            center={position}
            zoom={zoomLevel}
            style={{ height: '100%', width: '100%', borderRadius: '8px' }}
            scrollWheelZoom={false}
            className="z-0" // Ensure z-index doesn't interfere
            whenCreated={(mapInstance) => {
                // If a map instance already exists in the ref (e.g., due to fast refresh/Strict Mode), remove it first.
                if (mapRef.current && mapRef.current !== mapInstance) {
                    console.warn("whenCreated: mapRef had an existing instance. Removing it before assigning the new one.");
                    mapRef.current.remove();
                }
                mapRef.current = mapInstance; // Store the new map instance
            }}
            // Do NOT use a key={...} prop here unless absolutely necessary, as it forces remounts which cause this error.
            >
            <ChangeView center={position} zoom={zoomLevel} /> {/* Handles map view updates */}
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
      )}
    </div>
  );
};

export default MapVisualization;
