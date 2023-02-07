#! /usr/bin/env python
# __*__coding: UTF-8__*__
import  socket
import time
import json
import getpass
target_host = "127.0.0.1"
target_port = 8000
client = None;
wallets = {'0xEFc6089224068b20197156A91D50132b2A47b908': '', 
           '0x8A3214F28946A797088944396c476f014F88Dd37': ''}
for addr in wallets:
   print("********** Wallet Address:: %s **********\n" % addr)
   if wallets[addr]=='':
        str = getpass.getpass(prompt='Private Key ['+addr+']:')
        wallets[addr] = str;
def tcp_conn():
    global client;
    try:
        client = socket.socket(socket.AF_INET,socket.SOCK_STREAM)
        client.connect((target_host,target_port))
    except Exception as err:
        print(err)
tcp_conn()
while True:
    try: 
        str_json = json.dumps(wallets)
        client.send(str_json.encode())
        time.sleep(10)
    except Exception as err:
        tcp_conn()
        time.sleep(5)
        print(err)
