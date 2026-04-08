USE prm_master;

INSERT INTO tenants (name, slug, db_host, db_port, db_name, db_user, db_password, logo_url, primary_color) VALUES
('AeroGround Services',      'aeroground', 'mysql', 3306, 'aeroground_db', 'root', 'rootpassword', NULL, '#2563eb'),
('SkyServe Ground Handling',  'skyserve',   'mysql', 3306, 'skyserve_db',   'root', 'rootpassword', NULL, '#7c3aed'),
('GlobalPRM',                 'globalprm',  'mysql', 3306, 'globalprm_db',  'root', 'rootpassword', NULL, '#059669');
