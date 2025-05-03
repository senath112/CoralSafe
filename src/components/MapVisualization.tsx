
'use client';

import React, { useEffect, useState } from 'react';
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
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);
  return null;
};

const MapVisualization: React.FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  const [isClient, setIsClient] = useState(false);
  const mapRef = React.useRef<L.Map | null>(null); // Ref to store map instance

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Ensure latitude and longitude are valid numbers
  const isValidLatitude = typeof latitude === 'number' && !isNaN(latitude) && latitude >= -90 && latitude <= 90;
  const isValidLongitude = typeof longitude === 'number' && !isNaN(longitude) && longitude >= -180 && longitude <= 180;

  if (!isValidLatitude || !isValidLongitude) {
     // Don't render map if location is invalid initially
     // Keep the placeholder visible until valid data is available
     if (!isClient) {
       return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Loading map...</div>;
     }
     // If client-side and still invalid, show message
     return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Enter valid Latitude and Longitude.</div>;
  }

  const position: L.LatLngExpression = [latitude, longitude];
  const zoomLevel = 13; // Adjust zoom level as needed


  return (
    <div className="w-full h-full">
      {/* MapContainer is rendered only when isClient is true and position is valid */}
      {isClient ? (
         <MapContainer
            center={position}
            zoom={zoomLevel}
            style={{ height: '100%', width: '100%', borderRadius: '8px' }}
            scrollWheelZoom={false} // Disable scroll wheel zoom if desired
            whenCreated={(mapInstance) => {
                mapRef.current = mapInstance; // Store map instance
                console.log('Map created:', mapInstance);
            }}
         >
            {/* Use ChangeView to handle dynamic position updates */}
            <ChangeView center={position} zoom={zoomLevel} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <Marker position={position}>
              <Popup>
                Location: ({latitude.toFixed(4)}, {longitude.toFixed(4)}) <br />
                {depth !== null && !isNaN(depth) ? `Depth: ${depth}m` : 'Depth not specified'}
              </Popup>
            </Marker>
         </MapContainer>
       ) : (
           <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Loading map...</div>
       )}
    </div>
  );
};

export default MapVisualization;

