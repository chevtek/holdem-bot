**`$create`** _(Channel Only)_

Create a Hold'em table in the current channel.

---------------

**`--min-buy-in <number>`**  
Specify a minimum buy-in amount for the table. Default is $1000.

**`--tournament, -t`**  
Specifies the table is a tournament table. Disables joins after the first hand has begun and enforces minimum buy-in only.

**`--blind-increase-timer <number>`**  
How often (in minutes) the blinds should double. 0 to disable. Default is 0 for cash tables and 30 for tournament tables.

**`--no-sound`**  
Disable sound effects for this table.

**`--small-blind <number>`**  
Specify the amount of the small blind. Default is $10.

**`--big-blind <number>`**  
Specify the amount of the big blind. Default is $20.

**`--buy-in <number>`**  
Specify the amount you, as the creator, intend to bring to the table. Default is the table minimum buy-in.

**`--turn-timer <number>`**  
The number of seconds a player has to act on their turn. Default is 45 seconds. Specify 0 to disable turn timers.

**`--auto-destruct-timer <number>`**  
The number of minutes before an idle table self-destructs. Defaults to 15 minutes.

**`--reset`**  
Create a new table and override any existing table.