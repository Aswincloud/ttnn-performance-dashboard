import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Isolated so recharts can be code-split out of the initial bundle. Imported
// only via React.lazy in PerformanceTable — keep it the sole consumer of
// recharts so the dynamic chunk stays clean.
const TrendLineChart = ({ data, unit, height = 200 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} label={{ value: unit, angle: -90, position: 'insideLeft' }} />
      <Tooltip
        formatter={(value) => [`${value.toFixed(3)} ${unit}`, 'Performance']}
        labelFormatter={(label) => {
          const dataPoint = data.find((d) => d.date === label);
          return `${label} (${dataPoint?.commitId || 'N/A'})`;
        }}
      />
      <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
    </LineChart>
  </ResponsiveContainer>
);

export default TrendLineChart;
