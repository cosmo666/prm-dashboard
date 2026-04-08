USE prm_master;

-- Password: admin123 (using BCRYPT_PENDING convention — AuthService auto-hashes on first login)
SET @pw = 'BCRYPT_PENDING:admin123';

-- ============================================================
-- Tenant 1: AeroGround Services (id=1) — airports BLR, HYD, DEL
-- ============================================================
INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(1, 'admin',  @pw, 'Admin AeroGround',  'admin@aeroground.com'),
(1, 'john',   @pw, 'John Mathews',      'john@aeroground.com'),
(1, 'priya',  @pw, 'Priya Sharma',      'priya@aeroground.com'),
(1, 'ravi',   @pw, 'Ravi Kumar',        'ravi@aeroground.com');

SET @ag_admin = (SELECT id FROM employees WHERE tenant_id = 1 AND username = 'admin');
SET @ag_john  = (SELECT id FROM employees WHERE tenant_id = 1 AND username = 'john');
SET @ag_priya = (SELECT id FROM employees WHERE tenant_id = 1 AND username = 'priya');
SET @ag_ravi  = (SELECT id FROM employees WHERE tenant_id = 1 AND username = 'ravi');

INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(@ag_admin, 'BLR', 'Kempegowda International Airport'),
(@ag_admin, 'HYD', 'Rajiv Gandhi International Airport'),
(@ag_admin, 'DEL', 'Indira Gandhi International Airport'),
(@ag_john,  'BLR', 'Kempegowda International Airport'),
(@ag_john,  'HYD', 'Rajiv Gandhi International Airport'),
(@ag_priya, 'BLR', 'Kempegowda International Airport'),
(@ag_ravi,  'DEL', 'Indira Gandhi International Airport');

-- ============================================================
-- Tenant 2: SkyServe Ground Handling (id=2) — airports BLR, BOM, MAA
-- ============================================================
INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(2, 'admin',  @pw, 'Admin SkyServe',  'admin@skyserve.com'),
(2, 'anika',  @pw, 'Anika Patel',     'anika@skyserve.com'),
(2, 'deepak', @pw, 'Deepak Reddy',    'deepak@skyserve.com'),
(2, 'sunita', @pw, 'Sunita Desai',    'sunita@skyserve.com');

SET @ss_admin  = (SELECT id FROM employees WHERE tenant_id = 2 AND username = 'admin');
SET @ss_anika  = (SELECT id FROM employees WHERE tenant_id = 2 AND username = 'anika');
SET @ss_deepak = (SELECT id FROM employees WHERE tenant_id = 2 AND username = 'deepak');
SET @ss_sunita = (SELECT id FROM employees WHERE tenant_id = 2 AND username = 'sunita');

INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(@ss_admin,  'BLR', 'Kempegowda International Airport'),
(@ss_admin,  'BOM', 'Chhatrapati Shivaji Maharaj International Airport'),
(@ss_admin,  'MAA', 'Chennai International Airport'),
(@ss_anika,  'BLR', 'Kempegowda International Airport'),
(@ss_anika,  'BOM', 'Chhatrapati Shivaji Maharaj International Airport'),
(@ss_deepak, 'MAA', 'Chennai International Airport'),
(@ss_sunita, 'BOM', 'Chhatrapati Shivaji Maharaj International Airport');

-- ============================================================
-- Tenant 3: GlobalPRM (id=3) — airports SYD, KUL, JFK
-- ============================================================
INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(3, 'admin',  @pw, 'Admin GlobalPRM',  'admin@globalprm.com'),
(3, 'sarah',  @pw, 'Sarah Williams',   'sarah@globalprm.com'),
(3, 'mike',   @pw, 'Mike Johnson',     'mike@globalprm.com'),
(3, 'li',     @pw, 'Li Wei',           'li@globalprm.com');

SET @gp_admin = (SELECT id FROM employees WHERE tenant_id = 3 AND username = 'admin');
SET @gp_sarah = (SELECT id FROM employees WHERE tenant_id = 3 AND username = 'sarah');
SET @gp_mike  = (SELECT id FROM employees WHERE tenant_id = 3 AND username = 'mike');
SET @gp_li    = (SELECT id FROM employees WHERE tenant_id = 3 AND username = 'li');

INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(@gp_admin, 'SYD', 'Sydney Kingsford Smith Airport'),
(@gp_admin, 'KUL', 'Kuala Lumpur International Airport'),
(@gp_admin, 'JFK', 'John F. Kennedy International Airport'),
(@gp_sarah, 'SYD', 'Sydney Kingsford Smith Airport'),
(@gp_sarah, 'KUL', 'Kuala Lumpur International Airport'),
(@gp_mike,  'JFK', 'John F. Kennedy International Airport'),
(@gp_li,    'KUL', 'Kuala Lumpur International Airport');
