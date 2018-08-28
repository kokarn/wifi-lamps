require( 'dotenv' ).config();

const Lifx = require( 'lifx-http-api' );

const Telnet = require( './modules/telnet' );

const CLIENT_LIST = [
    '30:07:4d:79:98:d2',
    '58:48:22:8c:05:da',
];
const CLIENT_IDLE_TIME_SECONDS = 30;
const INACTIVE_CHECK_INTERVAL = 5000;

const connection = new Telnet( {
    host: '192.168.0.1',
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
    // debug: true,
} );
const client = new Lifx( {
    bearerToken: process.env.LIFX_TOKEN,
} );

let dataInterval = false;
let clients = false;
let activeClients = [];
let shouldStart = false;

const checkTime = function checkTime( i ) {
    return ( i < 10 ) ? "0" + i : i;
};

const getTimestamp = function getTimestamp() {
    const today = new Date();
    const h = today.getHours();
    const m = checkTime( today.getMinutes() );
    const s = checkTime( today.getSeconds() );

    return `[${ h }:${ m }:${ s }]`;
};

const setActiveClient = function( mac ) {
    for ( const client of clients ) {
        if ( client.macs.includes( mac ) ) {
            if ( !activeClients[ mac ] ) {
                console.log( `${ getTimestamp() } ${ mac } active` );

                activeClients[ mac ] = {
                    hostname: client.hostname,
                    mac: mac,
                };
            }

            activeClients[ mac ].timestamp = process.hrtime();

            break;
        }
    }
}

const handleLeases = function handleLeases( rawData ) {
    const leasesRows = rawData.split( '\r\n' );

    leasesRows.splice( leasesRows.length - 1, 1 );

    clients = leasesRows.map( ( lease ) => {
        const [ leaseTime, mac, ip, hostname, othermac ] = lease.split( ' ' );

        return {
            macs: [ mac, othermac ],
            ip,
            hostname,
        };
    } );

    console.log( `Got ${ Object.keys( clients ).length } active leases` );
};

const handleAssociation = function handleAssociation( rawData ) {
    const associationsRows = rawData.split( '\r\n' );

    for ( const association of associationsRows ) {
        const [ stuff, mac ] = association.split( ' ' );

        if ( !mac ) {
            continue;
        }

        setActiveClient( mac.replace( 'assoclist', '' ).toLowerCase() );
    }
};

const removeInactive = function removeInactive(){
    for ( const mac in activeClients ) {
        if ( process.hrtime( activeClients[ mac ].timestamp )[ 0 ] > CLIENT_IDLE_TIME_SECONDS ) {
            console.log( `${ getTimestamp() } ${ mac } inactive` );
            delete activeClients[ mac ];
        }
    }

    lightDetection();
};

const lightDetection = function lightDetection(){
    if ( shouldStart ) {
        for ( const mac of CLIENT_LIST ) {
            if ( !activeClients[ mac ] ) {
                continue;
            }

            client.setState( 'all',
                {
                    power: 'on',
                    brightness: 1,
                    duration: 10,
                } )
                .then( ( response ) => {
                    console.log( response );
                } )
                .catch( ( lifxError ) => {
                    console.error( lifxError );
                } );

            shouldStart = false;
            return true;
        }
    }

    // Should we reset start?
    for ( const mac of CLIENT_LIST ) {
        if ( activeClients[ mac ] ) {
            // at least one device is active

            return true;
        }
    }

    if ( !shouldStart ) {
        console.log( 'Lights set to turn on next connect' );
        shouldStart = true;
    }
};

const setupDeviceDetection = function setupDeviceDetection(){
    connection.on( 'data', ( data ) => {
        handleAssociation( data );
    } );

    setInterval( () => {
        connection.send( 'wl -i eth1 assoclist' );
    }, 1000 );

    setTimeout( () => {
        setInterval( () => {
            connection.send( 'wl -i eth2 assoclist' );
        }, 1000 );
    }, 500 );

    setInterval( removeInactive, INACTIVE_CHECK_INTERVAL );
};

connection.on( 'login', () => {
    connection.once( 'data', ( data ) => {
        handleLeases( data );

        setupDeviceDetection();
    } );

    connection.send( 'cat /var/lib/misc/dnsmasq.leases' );
} );

connection.connect();
