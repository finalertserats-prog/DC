const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_connections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL,
        username VARCHAR(255),
        password VARCHAR(255),
        database_name VARCHAR(255),
        sr_username VARCHAR(255),
        sr_password VARCHAR(255),
        ui_url VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_table_metadata (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        description TEXT,
        use_case TEXT,
        owner VARCHAR(255),
        tags TEXT[],
        column_comments JSONB DEFAULT '{}'::jsonb,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(connection_id, db_name, table_name)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_profiling_runs (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(100) NOT NULL,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255),
        table_name VARCHAR(255),
        category VARCHAR(100),
        pk_column VARCHAR(100),
        pk_type VARCHAR(50),
        total_rows BIGINT,
        active_rows BIGINT,
        deleted_rows BIGINT,
        data_since TIMESTAMP,
        last_modified TIMESTAMP,
        incremental_col VARCHAR(100),
        load_type VARCHAR(50),
        status VARCHAR(50),
        row_count_change BIGINT,
        profiled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_schema_snapshots (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        columns JSONB NOT NULL,
        snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_schema_diffs (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        diff_type VARCHAR(50) NOT NULL,
        column_name VARCHAR(255) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_lineage_nodes (
        id SERIAL PRIMARY KEY,
        node_id VARCHAR(255) UNIQUE NOT NULL,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255),
        table_name VARCHAR(255),
        layer VARCHAR(100),
        application VARCHAR(255),
        node_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_lineage_edges (
        id SERIAL PRIMARY KEY,
        source_node_id VARCHAR(255) NOT NULL,
        target_node_id VARCHAR(255) NOT NULL,
        dag_id VARCHAR(255),
        transformation_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_node_id, target_node_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_column_lineage (
        id SERIAL PRIMARY KEY,
        source_node_id VARCHAR(255) NOT NULL,
        target_node_id VARCHAR(255) NOT NULL,
        source_column VARCHAR(255) NOT NULL,
        target_column VARCHAR(255) NOT NULL,
        transformation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_quality_rules (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        column_name VARCHAR(255),
        rule_type VARCHAR(100) NOT NULL,
        rule_config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_quality_results (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES sdp_quality_rules(id) ON DELETE CASCADE,
        run_id VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        actual_value TEXT,
        expected_value TEXT,
        message TEXT,
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sdp_observability (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES sdp_connections(id) ON DELETE CASCADE,
        db_name VARCHAR(255),
        table_name VARCHAR(255),
        total_count BIGINT,
        today_count BIGINT,
        previous_count BIGINT,
        target_date VARCHAR(50),
        measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO sdp_users (username, password, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO NOTHING;
    `, [
      process.env.DEFAULT_ADMIN_USER || 'admin',
      process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
    ]);

    console.log('✅ All database tables ready.');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  } finally {
    client.release();
  }
};

module.exports = { pool, initDb };