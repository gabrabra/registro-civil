import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { BatchProvider } from './context/BatchContext.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import LivrosList from './pages/livros/List.jsx';
import LivrosForm from './pages/livros/Form.jsx';
import NascimentosList from './pages/nascimentos/List.jsx';
import NascimentosForm from './pages/nascimentos/Form.jsx';
import BatchImport from './pages/nascimentos/BatchImport.jsx';
import TestamentosList from './pages/testamentos/List.jsx';
import TestamentosForm from './pages/testamentos/Form.jsx';
import EscriturasList from './pages/escrituras/List.jsx';
import EscriturasForm from './pages/escrituras/Form.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Config from './pages/Config.jsx';
import UsuariosList from './pages/usuarios/List.jsx';
import UsuariosForm from './pages/usuarios/Form.jsx';
import PerfisList from './pages/perfis/List.jsx';
import PerfisForm from './pages/perfis/Form.jsx';
import AuditoriaList from './pages/auditoria/List.jsx';
import RotaPermitida from './components/RotaPermitida.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BatchProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route index element={<Navigate to="/livros" replace />} />
              <Route path="livros"            element={<LivrosList />} />
              <Route path="livros/novo"       element={<LivrosForm />} />
              <Route path="livros/:id/editar" element={<LivrosForm />} />
              <Route path="nascimentos"              element={<NascimentosList />} />
              <Route path="nascimentos/novo"         element={<NascimentosForm />} />
              <Route path="nascimentos/:id/editar"   element={<NascimentosForm />} />
              <Route path="nascimentos/lote"         element={<BatchImport />} />
              <Route path="obitos"        element={<Placeholder title="Óbitos" />} />
              <Route path="casamentos"   element={<Placeholder title="Casamentos" />} />
              <Route path="testamentos"                element={<TestamentosList />} />
              <Route path="testamentos/novo"           element={<TestamentosForm />} />
              <Route path="testamentos/:id/editar"     element={<TestamentosForm />} />
              <Route path="escrituras-compra-venda"              element={<EscriturasList />} />
              <Route path="escrituras-compra-venda/novo"         element={<EscriturasForm />} />
              <Route path="escrituras-compra-venda/:id/editar"   element={<EscriturasForm />} />
              <Route path="configuracoes" element={
                <RotaPermitida modulo="configuracoes" acao="ver"><Config /></RotaPermitida>
              } />
              <Route path="configuracoes/usuarios" element={
                <RotaPermitida modulo="usuarios" acao="ver"><UsuariosList /></RotaPermitida>
              } />
              <Route path="configuracoes/usuarios/novo" element={
                <RotaPermitida modulo="usuarios" acao="criar"><UsuariosForm /></RotaPermitida>
              } />
              <Route path="configuracoes/usuarios/:id/editar" element={
                <RotaPermitida modulo="usuarios" acao="editar"><UsuariosForm /></RotaPermitida>
              } />
              <Route path="configuracoes/perfis" element={
                <RotaPermitida modulo="perfis" acao="ver"><PerfisList /></RotaPermitida>
              } />
              <Route path="configuracoes/perfis/novo" element={
                <RotaPermitida modulo="perfis" acao="criar"><PerfisForm /></RotaPermitida>
              } />
              <Route path="configuracoes/perfis/:id/editar" element={
                <RotaPermitida modulo="perfis" acao="editar"><PerfisForm /></RotaPermitida>
              } />
              <Route path="configuracoes/atividades" element={
                <RotaPermitida modulo="auditoria" acao="ver"><AuditoriaList /></RotaPermitida>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </BatchProvider>
    </AuthProvider>
  );
}
