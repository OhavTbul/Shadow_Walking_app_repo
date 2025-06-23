# Shadow Route Planner 🌞🌳

A sophisticated web application that helps users find optimal walking routes based on real-time sun exposure and shadow coverage analysis. Built with Flask backend and modern JavaScript frontend, this application provides intelligent route planning that considers building shadows, sun position, and user preferences.

## 🌟 Features

### Core Functionality
- **Interactive Map Interface**: Built with MapLibre GL for smooth, responsive map interactions
- **Real-time Shadow Visualization**: Dynamic shadow rendering based on current sun position
- **Intelligent Route Planning**: Advanced algorithms that balance distance and shade coverage
- **Customizable Shade Preferences**: Adjustable weight system (1.0-10.0) for shade vs. distance optimization
- **Future Route Planning**: Plan routes for specific dates and times
- **Route Comparison**: Compare multiple route options with different shade preferences

### User Experience
- **Progressive Web App (PWA)**: Installable on mobile devices with offline capabilities
- **Responsive Design**: Optimized for both mobile and desktop use
- **User Authentication**: Secure login/registration system with favorites management
- **Favorites System**: Save and manage preferred routes
- **Real-time Updates**: Live shadow data updates throughout the day

### Technical Features
- **Sun Position Calculations**: Accurate solar position using pvlib library
- **Building Shadow Analysis**: Complex shadow geometry calculations
- **OpenStreetMap Integration**: Real-world map data and routing
- **Geospatial Processing**: Advanced coordinate transformations and spatial analysis

## 🏗️ Project Structure

```
Shadow_Walking_app_repo/
├── backend/
│   ├── Flask_app.py          # Main Flask application with API endpoints
│   ├── Class_Shadow.py       # Shadow calculation and analysis logic
│   ├── Open_Street_Map.py    # OpenStreetMap data integration
│   ├── SunLocation.py        # Sun position and solar calculations
│   ├── Algorithmica.py       # Route finding and optimization algorithms
│   ├── config.py             # Application configuration and constants
│   ├── users.json            # User data storage
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── index.html            # Main application interface
│   ├── manifest.json         # PWA configuration
│   ├── service-worker.js     # Offline functionality
│   ├── css/
│   │   ├── base.css          # Base styles
│   │   ├── layout.css        # Layout components
│   │   ├── comparison.css    # Route comparison styles
│   │   └── components/       # Modular CSS components
│   ├── js/
│   │   ├── app.js            # Main application logic
│   │   ├── map.js            # Map interaction and rendering
│   │   ├── auth.js           # Authentication handling
│   │   └── bottomSheet.js    # Mobile UI components
│   └── assets/               # Images, icons, and static resources
└── README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for map data

### Backend Setup

1. **Clone and navigate to the project**:
```bash
cd Shadow_Walking_app_repo
```

2. **Create and activate virtual environment**:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install Python dependencies**:
```bash
cd backend
pip install -r requirements.txt
```

4. **Run the Flask application**:
```bash
python Flask_app.py
```

The backend will start on `http://localhost:5000` by default.

### Frontend Setup

The frontend is served directly by the Flask application. Simply open your browser and navigate to:
```
http://localhost:5000
```

No additional setup required - the application is fully self-contained!

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the backend directory for custom configuration:

```env
SECRET_KEY=your-secret-key-here
FLASK_ENV=development
```

### API Configuration
Modify `backend/config.py` to adjust:
- Maximum route distance
- Shade weight limits
- CORS origins
- Error messages

## 📡 API Endpoints

### Route Planning
- **POST** `/route` - Calculate optimal route between two points
  ```json
  {
    "start": [latitude, longitude],
    "dest": [latitude, longitude],
    "shade_weight": 1.0
  }
  ```

### Shadow Data
- **GET** `/shadows` - Get current shadow coverage data
- **POST** `/shadows_at_time` - Get shadow data for specific time

### User Management
- **POST** `/register` - User registration
- **POST** `/login` - User authentication
- **POST** `/logout` - User logout
- **GET** `/api/favorites` - List user favorites
- **POST** `/api/favorites` - Add route to favorites
- **DELETE** `/api/favorites` - Remove route from favorites

## 🛠️ Technology Stack

### Backend
- **Flask** - Web framework
- **Flask-CORS** - Cross-origin resource sharing
- **Flask-Login** - User session management
- **OSMnx** - OpenStreetMap data processing
- **NetworkX** - Graph algorithms for routing
- **GeoPandas** - Geospatial data manipulation
- **pvlib** - Solar position calculations
- **PyProj** - Coordinate transformations

### Frontend
- **MapLibre GL** - Interactive mapping
- **Vanilla JavaScript** - Application logic
- **CSS3** - Styling and animations
- **Progressive Web App** - Offline capabilities
- **Font Awesome** - Icons

### Data Sources
- **OpenStreetMap** - Map data and building footprints
- **Solar Position Algorithms** - Real-time sun calculations

## 🧪 Development

### Running Tests
```bash
cd backend
pytest
```

### Code Quality
The project uses:
- **Black** - Python code formatting
- **Flake8** - Python linting

### Development Server
For development with auto-reload:
```bash
cd backend
export FLASK_ENV=development
python Flask_app.py
```

## 🚀 Deployment

### Production Setup
1. Set production environment variables
2. Use Gunicorn for WSGI server:
```bash
gunicorn -w 4 -b 0.0.0.0:5000 Flask_app:app
```

### Docker Deployment (Optional)
Create a `Dockerfile`:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "backend.Flask_app:app"]
```

## 🔍 Troubleshooting

### Common Issues

**Map not loading**: Check internet connection and CORS settings
**Routes not calculating**: Verify coordinates are within supported area
**Shadow data missing**: Check sun position calculations and building data

### Performance Optimization
- Shadow calculations are cached for better performance
- Large route distances may take longer to process
- Consider reducing map area for faster initial load

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow PEP 8 for Python code
- Use meaningful commit messages
- Test your changes thoroughly
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ben-Gurion University** - Academic support and resources
- **OpenStreetMap** - Map data and community
- **MapLibre** - Open-source mapping library
- **Solar Position Community** - Solar calculation algorithms

## 📞 Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Contact the development team
- Check the troubleshooting section above

---

**Built with ❤️ for better walking experiences** 
