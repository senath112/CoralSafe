
'use client';

import React, { useState, useEffect } from 'react';
import Map, { Marker, Popup, NavigationControl, FullscreenControl, ScaleControl, GeolocateControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapVisualizationProps {
  latitude: number | null;
  longitude: number | null;
}

const MapVisualization: React.FC<MapVisualizationProps> = ({ latitude, longitude }) => {
  const [isClient, setIsClient] = useState(false);
  const [popupInfo, setPopupInfo] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    // Ensure this code runs only on the client
    setIsClient(true);
  }, []);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    console.error("Mapbox token is not configured. Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN environment variable.");
    return (
      <div className="w-full h-[300px] flex items-center justify-center bg-red-100 dark:bg-red-900 rounded-lg text-red-700 dark:text-red-200">
        Map configuration error: Missing access token.
      </div>
    );
  }

  // Ensure latitude and longitude are valid numbers
  const isValidLatitude = typeof latitude === 'number' && !isNaN(latitude) && latitude >= -90 && latitude <= 90;
  const isValidLongitude = typeof longitude === 'number' && !isNaN(longitude) && longitude >= -180 && longitude <= 180;
  const position: { latitude: number; longitude: number } | null = isValidLatitude && isValidLongitude ? { latitude, longitude } : null;

  // Placeholder until client is ready or if position is invalid
  if (!isClient) {
    return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Loading map...</div>;
  }
  if (!position) {
    return <div className="w-full h-[300px] flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-muted-foreground">Enter valid Latitude and Longitude.</div>;
  }

  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-md">
      <Map
        initialViewState={{
          longitude: position.longitude,
          latitude: position.latitude,
          zoom: 13, // Adjust zoom level as needed
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11" // Choose a Mapbox style
        mapboxAccessToken={mapboxToken}
      >
        <GeolocateControl position="top-left" />
        <FullscreenControl position="top-left" />
        <NavigationControl position="top-left" />
        <ScaleControl />

        <Marker
          longitude={position.longitude}
          latitude={position.latitude}
          anchor="bottom"
          onClick={e => {
            // If we let the click event propagates to the map, it will immediately close the popup
            // with `closeOnClick: true`
            e.originalEvent.stopPropagation();
            setPopupInfo(position);
          }}
          color="#3FB1CE" // Use a cyan-like color for the marker
        />

        {popupInfo && (
          <Popup
            anchor="top"
            longitude={Number(popupInfo.longitude)}
            latitude={Number(popupInfo.latitude)}
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
            className="text-sm"
          >
            <div>
              Location: ({popupInfo.latitude.toFixed(4)}, {popupInfo.longitude.toFixed(4)})
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
};

export default MapVisualization;

