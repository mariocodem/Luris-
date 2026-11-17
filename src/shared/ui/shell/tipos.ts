/** Íconos disponibles para la navegación (se resuelven en el cliente, ver iconos.tsx). */
export type NombreDeIcono =
  | 'inicio'
  | 'procesos'
  | 'pendientes'
  | 'consulta-masiva'
  | 'notificaciones'
  | 'usuarios'
  | 'ajustes'
  | 'despachos';

export interface EnlaceDeNavegacion {
  readonly href: string;
  readonly texto: string;
  readonly icono: NombreDeIcono;
  /** Aparece en la barra inferior del móvil; el resto va en «Más». Máximo cuatro. */
  readonly principalEnMovil: boolean;
}

export interface PersonaEnSesion {
  readonly nombre: string;
  readonly descripcion: string;
}
