import pvlib
from datetime import datetime,date
import pytz

LATITUDE = 31.261
LONGITUDE = 34.802
TIME_ZONE = 'Asia/Jerusalem'

#Time setting
YEAR = 2024
MONTH = 12
DAY = 9
HOUR = 14
MINUTE = 0


class Location:

    def __init__(self, latitude, longitude, tz) -> None:
        # Location of Ben Gurion University
        self.latitude = latitude
        self.longitude = longitude
        self.time_zone = tz
        self.location_obj = self.make_location()

        #self.time = datetime(YEAR, MONTH, DAY, HOUR, DAY, tzinfo=pytz.timezone(self.time_zone))
        self.time = datetime.now(pytz.timezone(self.time_zone))


    def make_location(self):
        """Set the location using pvlib's Location class and specify the timezone"""
        location = pvlib.location.Location(self.latitude, self.longitude, tz=self.time_zone)
        return location
    

class SunLocation:

    def __init__(self) -> None:
        self.location = Location(LATITUDE,LONGITUDE,TIME_ZONE)

        # Get the solar position at the specified time and location
        self.solar_position = self.location.location_obj.get_solarposition(self.location.time)
        self.azimuth = self.solar_position['azimuth']
        self.altitude = self.solar_position['apparent_elevation']


    def is_sunset(self):
        pass   