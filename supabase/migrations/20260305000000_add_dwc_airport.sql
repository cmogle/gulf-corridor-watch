-- Add DWC (Al Maktoum International / Dubai World Central) as a third tracked airport.
-- DWC is primarily a cargo hub.
alter table flight_observations drop constraint if exists flight_observations_airport_check;
alter table flight_observations add constraint flight_observations_airport_check
  check (airport in ('DXB', 'AUH', 'DWC'));
