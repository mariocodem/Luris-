-- Fase 9 (Tyba): sistema de origen de las actuaciones que llegan por otra plataforma
-- (las de Tyba llegan por la CPNU). Nulo si la plataforma de la consulta es también su origen.
ALTER TABLE "actuaciones" ADD COLUMN "origen" "codigo_plataforma";
