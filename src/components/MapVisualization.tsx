
'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon issue with Next.js/Webpack
if (typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
        iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default.src,
        iconUrl: require('leaflet/dist/images/marker-icon.png').default.src,
        shadowUrl: require('leaflet/dist/images/marker-shadow.png').default.src,
    });
}


interface MapVisualizationProps {
  latitude: number | null;
  longitude: number | null;
  depth: number | null; // Included depth for potential popup info
}

// Component to update map view when position changes
const ChangeView: React.FC<{ center: L.LatLngExpression; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
};

const MapVisualization: React.FC<MapVisualizationProps> = ({ latitude, longitude, depth }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!latitude || !longitude) {
    return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Location data not available.</div>;
  }

  const position: L.LatLngExpression = [latitude, longitude];
  const zoomLevel = 13; // Adjust zoom level as needed


  return (
    <div className="w-full h-full">
      {/* MapContainer is rendered only when isClient is true */}
      {isClient && (
         <MapContainer
            key={`${latitude}-${longitude}`} // Add key to force remount if needed, though ChangeView is preferred
            center={position}
            zoom={zoomLevel}
            style={{ height: '100%', width: '100%', borderRadius: '8px' }}
            scrollWheelZoom={false} // Disable scroll wheel zoom if desired
            whenCreated={(mapInstance) => {
              // Optional: Do something with the map instance after creation
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
                {depth !== null ? `Depth: ${depth}m` : 'Depth not specified'}
              </Popup>
            </Marker>
         </MapContainer>
       )}
       {!isClient && <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Loading map...</div>}
    </div>
  );
};

export default MapVisualization;
