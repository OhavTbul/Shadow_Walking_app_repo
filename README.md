# Shadow Route Planner

A web application that helps users find optimal walking routes based on sun exposure and shadow coverage.

## Features

- Interactive map interface for route planning
- Real-time shadow visualization
- Customizable shade preference settings
- Dynamic route calculation based on building shadows
- Responsive design for mobile and desktop

## Project Structure

```
.
├── backend/
│   ├── Flask_app.py          # Main Flask application
│   ├── Class_Shadow.py       # Shadow calculation logic
│   ├── Open_Street_Map.py    # OpenStreetMap integration
│   ├── SunLocation.py        # Sun position calculations
│   ├── Algorithmica.py       # Route finding algorithms
│   └── requirements.txt      # Python dependencies
└── frontend/
    └── index.html           # Frontend application
```

## Setup

### Backend Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Run the Flask application:
```bash
python Flask_app.py
```

### Frontend Setup

1. Open `frontend/index.html` in a web browser
2. No additional setup required as it's a static application

###open the web
1. cd /Users/iluski/Desktop/shadow_walk_app/Shadow_Walking_app_repo && pwd
2.open frontend/index.html

## API Endpoints

### POST /route
Calculate a route between two points based on shadow coverage.

Request body:
```json
{
    "start": [latitude, longitude],
    "dest": [latitude, longitude],
    "shade_weight": float
}
```

### GET /shadows
Get the current shadow coverage data for the map area.

## Development

### Running Tests
```bash
cd backend
pytest
```

### Code Style
The project uses Black for Python code formatting and Flake8 for linting.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License 
