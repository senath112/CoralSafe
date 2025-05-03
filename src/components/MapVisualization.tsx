
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Removed the problematic block using require() for icons, as it causes issues with Turbopack.
// Dynamic import and CSS import should handle default icon paths if configured correctly.
// If icons still don't appear, further investigation might be needed for Turbopack compatibility.


interface MapVisualizationProps {
  latitude: number | null;
  longitude: number | null;
  depth: number | null; // Included depth for potential popup info
}

// Component to update map view when position changes
const ChangeView: React.FC<{ center: L.LatLngExpression; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    // Check if center is valid before setting view
    if (center && typeof center[0] === 'number' && typeof center[1] === 'number' && !isNaN(center[0]) && !isNaN(center[1])) {
        console.log("MapVisualization: Setting map view to:", center, "Zoom:", zoom);
        map.setView(center, zoom);
    } else {
        console.warn("MapVisualization: Invalid center received for ChangeView:", center);
    }
  }, [map, center, zoom]);
  return null;
};

const MapVisualization: React.FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  const [isClient, setIsClient] = useState(false);
  const mapRef = useRef<L.Map | null>(null); // Ref to store map instance

  useEffect(() => {
    // This ensures Leaflet code runs only on the client
    setIsClient(true);
    // Fix for default icon path issues with Next.js/Webpack
    // You might need this if marker icons are missing
    (async () => {
      if (typeof window !== 'undefined') {
        // @ts-ignore
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: (await import('leaflet/dist/images/marker-icon-2x.png')).default.src,
          iconUrl: (await import('leaflet/dist/images/marker-icon.png')).default.src,
          shadowUrl: (await import('leaflet/dist/images/marker-shadow.png')).default.src,
        });
         console.log("MapVisualization: Leaflet icons configured.");
      }
    })();

  }, []); // Empty dependency array ensures this runs only once on mount

  // Ensure latitude and longitude are valid numbers
  const isValidLatitude = typeof latitude === 'number' && !isNaN(latitude) && latitude >= -90 && latitude <= 90;
  const isValidLongitude = typeof longitude === 'number' && !isNaN(longitude) && longitude >= -180 && longitude <= 180;
  const position: L.LatLngExpression | null = isValidLatitude && isValidLongitude ? [latitude, longitude] : null;
  const zoomLevel = 13; // Adjust zoom level as needed

  // Placeholder until client is ready or if position is invalid
  if (!isClient) {
    return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Loading map...</div>;
  }
  if (!position) {
    return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Enter valid Latitude and Longitude.</div>;
  }


  return (
    <div className="w-full h-full">
      {/* MapContainer renders only once when position is valid and client is ready */}
      {/* Subsequent updates are handled by ChangeView */}
      <MapContainer
        center={position} // Initial center
        zoom={zoomLevel} // Initial zoom
        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
        scrollWheelZoom={false} // Disable scroll wheel zoom if desired
        whenCreated={(mapInstance) => {
          // Prevent re-initialization if map already exists
          if (!mapRef.current) {
             mapRef.current = mapInstance;
             console.log('Map created:', mapInstance);
          }
        }}
        // No key prop needed here, rely on ChangeView for updates
      >
        <ChangeView center={position} zoom={zoomLevel} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={position}>
          <Popup>
            Location: ({latitude?.toFixed(4)}, {longitude?.toFixed(4)}) <br />
            {depth !== null && !isNaN(depth) ? `Depth: ${depth}m` : 'Depth not specified'}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default MapVisualization;
