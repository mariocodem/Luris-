-- AlterTable
ALTER TABLE "procesos" ADD COLUMN     "busqueda" VARCHAR(510) NOT NULL DEFAULT '';

-- Llena la búsqueda de los procesos existentes: alias y cliente en minúsculas y sin tildes.
-- (Las filas nuevas la reciben del repositorio de procesos.)
UPDATE "procesos"
SET "busqueda" = trim(regexp_replace(
  translate(
    lower(concat_ws(' ', "alias", "cliente")),
    'áàäâéèëêíìïîóòöôúùüûñç',
    'aaaaeeeeiiiioooouuuunc'
  ),
  '\s+', ' ', 'g'
));
