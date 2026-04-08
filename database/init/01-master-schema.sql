CREATE DATABASE IF NOT EXISTS prm_master;
USE prm_master;

CREATE TABLE tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    db_host VARCHAR(255) NOT NULL DEFAULT 'mysql',
    db_port INT NOT NULL DEFAULT 3306,
    db_name VARCHAR(100) NOT NULL,
    db_user VARCHAR(100) NOT NULL DEFAULT 'root',
    db_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logo_url VARCHAR(500) NULL,
    primary_color VARCHAR(7) NOT NULL DEFAULT '#2563eb'
);

CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY uq_tenant_username (tenant_id, username)
);

CREATE TABLE employee_airports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    airport_code VARCHAR(10) NOT NULL,
    airport_name VARCHAR(100) NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE KEY uq_employee_airport (employee_id, airport_code)
);

CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    token VARCHAR(500) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);
