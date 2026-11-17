import {
  Bell,
  Building2,
  ClipboardCheck,
  FolderOpen,
  House,
  ListChecks,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { NombreDeIcono } from './tipos';

export const ICONOS: Readonly<Record<NombreDeIcono, LucideIcon>> = {
  inicio: House,
  procesos: FolderOpen,
  pendientes: ClipboardCheck,
  'consulta-masiva': ListChecks,
  notificaciones: Bell,
  usuarios: Users,
  ajustes: Settings,
  despachos: Building2,
};
