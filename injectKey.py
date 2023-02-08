#! /usr/bin/env python
# __*__coding: UTF-8__*__
import  socket
import time
import json
import getpass
target_host = "127.0.0.1"
target_port = 8000
client = None;
wallets = {'0x0043d60e87c5dd08C86C3123340705a1556C4719': ''}
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
        str_json = json.dumps(wallets)
        client.send(str_json.encode())
    except Exception as err:
        print(err)
tcp_conn()
while True:
    try: 
        time.sleep(10)
        str_json = json.dumps(wallets)
        client.send(str_json.encode())
    except Exception as err:
        tcp_conn()
        time.sleep(2)
        print(err)
