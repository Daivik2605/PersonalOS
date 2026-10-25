import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './app/AuthGate'
import { Shell } from './app/Shell'
import { Home, Trends, Week } from './screens/placeholders'
import { DataProvider } from './data/DataProvider'
import { Settings } from './screens/Settings'
import { System } from './screens/System'

export default function App() {
  return (
    <AuthGate>
      <DataProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="week" element={<Week />} />
          <Route path="trends" element={<Trends />} />
          <Route path="system" element={<System />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </DataProvider>
    </AuthGate>
  )
}
