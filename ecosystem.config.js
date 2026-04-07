module.exports = {
  apps: [
    {
      name: 'data-explorer-backend',
      script: 'server.js',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/backend',
      env_file: '/Users/yashaswiram/work_codes/Data_Commander/backend/.env',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'data-explorer-frontend',
      script: 'npm',
      args: 'run dev -- --host',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/frontend',
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'etl-pipeline-server',
      script: 'node',
      args: 'server/index.js',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/etl-pipeline',
      env: { NODE_ENV: 'production', PORT: 4000 }
    },
    {
      name: 'etl-pipeline-frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/etl-pipeline',
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'superset-dataviz-backend',
      script: 'python3',
      args: '-m uvicorn api.server:app --reload --port 8000',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/superset-dataviz',
      interpreter: 'none',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'superset-dataviz-frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/superset-dataviz/frontend',
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'data-disposition-backend',
      script: 'python3',
      args: '-m uvicorn server:app --reload --port 3978',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/data-disposition',
      interpreter: 'none',
      env_file: '/Users/yashaswiram/work_codes/Data_Commander/data-disposition/.env',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'sdp-metadata-backend',
      script: 'server.js',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/sdp-metadata/backend',
      env_file: '/Users/yashaswiram/work_codes/Data_Commander/sdp-metadata/backend/.env',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'sdp-metadata-frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host',
      cwd: '/Users/yashaswiram/work_codes/Data_Commander/sdp-metadata/frontend',
      env: { NODE_ENV: 'development' }
    }
  ]
};
