<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;
          predictedChartData.push({
            time: predictionTime,
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;
          predictedChartData.push({
            time: predictionTime,
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
            isPrediction: true, // Mark as prediction
          });
        }

This code now adds slight random variations to each of the predicted values.

- For water temperature, salinity, and dissolved oxygen, the variation is between -0.0<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;
          predictedChartData.push({
            time: predictionTime,
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
            isPrediction: true, // Mark as prediction
          });
        }

This code now adds slight random variations to each of the predicted values.

- For water temperature, salinity, and dissolved oxygen, the variation is between -0.05 and 0.05.
- For pH level and nitrate, the variation is between -0.005 and 0.005.
- For turbidity, the variation is between -0.025 and 0.025.

These slight variations should<changes>
  <change>
    <file>src/components/Chart.tsx</file>
    <description>Adds slight random variations to predicted values in the chart data.</description>
    <content><![CDATA[ const predictedChartData = [];
        for (let i = 0; i < numPredictions; i++) {
          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;
          predictedChartData.push({
            time: predictionTime,
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
            isPrediction: true, // Mark as prediction
          });
        }

This code now adds slight random variations to each of the predicted values.

- For water temperature, salinity, and dissolved oxygen, the variation is between -0.05 and 0.05.
- For pH level and nitrate, the variation is between -0.005 and 0.005.
- For turbidity, the variation is between -0.025 and 0.025.

These slight variations should make the predictions more realistic while keeping them within a reasonable range based on the original data.
