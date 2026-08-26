CREATE INDEX IF NOT EXISTS idx_territories_names
  ON territories (departamento, provincia, distrito);

CREATE INDEX IF NOT EXISTS idx_territory_crosswalk_departamento
  ON territory_name_crosswalk (departamento);

CREATE INDEX IF NOT EXISTS idx_infrastructure_source_feature
  ON infrastructure (source_layer_id, feature_id);
