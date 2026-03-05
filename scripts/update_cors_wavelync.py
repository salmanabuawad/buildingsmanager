import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('185.229.226.37', username='asset_flow', password='KortexDigital1342#')
c.exec_command(r"sudo sed -i 's|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,http://185.229.226.37,https://185.229.226.37,https://wavelync.com,https://www.wavelync.com,http://wavelync.com,http://www.wavelync.com|' /home/asset_flow/buildingsmanager/backend/.env")[1].read()
c.exec_command('sudo systemctl restart assetflow-backend')[1].read()
print('Done.')
c.close()
