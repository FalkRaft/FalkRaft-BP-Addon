# report any players with the 'report' tag without the 'op' tag to staff/admins
execute as @a[tag=report,tag=!op] at @s run tellraw @a[tag=op] {"translate":[{"text":"[FalkRaft] Player: §e"},{"selector":"@a[tag=report]"},{"text":"§r, is §chacking§r! Please go through their anticheat logs, inspect them and ban them if they are hacking!"}]}

function varfuncs/isAirborne

## Anti CBE
# kill any command block minecarts and NPCs around any player without the tag 'admin' and 'op'
execute as @a at @s if entity @s[tag=!op] run kill @e[type=npc,r=8]
execute as @a at @s if entity @s[tag=!op] run kill @e[type=command_block_minecart,r=8]
execute as @a at @s if entity @s[tag=!op] run fill ~-8 ~-8 ~-8 ~8 ~8 ~8 air replace command_block
execute as @a at @s if entity @s[tag=!op] run fill ~-8 ~-8 ~-8 ~8 ~8 ~8 air replace chain_command_block
execute as @a at @s if entity @s[tag=!op] run fill ~-8 ~-8 ~-8 ~8 ~8 ~8 air replace repeating_command_block
clear @a[tag=!op,hasitem={item=command_block}] command_block
clear @a[tag=!op,hasitem={item=chain_command_block}] chain_command_block
clear @a[tag=!op,hasitem={item=repeating_command_block}] repeating_command_block
clear @a[tag=!op,hasitem={item=bedrock}] bedrock
clear @a[tag=!op,hasitem={item=barrier}] barrier
clear @a[tag=!op,hasitem={item=border_block}] border_block
clear @a[tag=!op,hasitem={item=mob_spawner}] mob_spawner
clear @a[tag=!op,hasitem={item=command_block_minecart}] command_block_minecart
