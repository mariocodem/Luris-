declare const marca: unique symbol;

/**
 * Tipo "marcado": un `string` que solo se obtiene tras validarlo. Evita pasar texto sin
 * normalizar donde se espera, por ejemplo, un `Radicado`. En tiempo de ejecución sigue
 * siendo un `string`, así que se serializa y persiste sin conversiones.
 */
export type Marca<T, M extends string> = T & { readonly [marca]: M };
