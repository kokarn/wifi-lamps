const net = require( 'net' );
const EventEmitter = require( 'events' );

class Telnet extends EventEmitter {
    constructor( options ) {
        super();

        this.isLoggedIn = false;
        this.client = new net.Socket();

        this.port = options.port || 23;
        this.host = options.host;

        this.username = options.username;
        this.password = options.password;

        this.loginMatch = /login:/i;
        this.passwordMatch = /password:/i;
        this.promptMatch = /^.+?#/i;

        this.debug = options.debug || false;

        this.emitData = '';
        this.skipEmit = '';

        this.bindEvents();
    }

    bindEvents () {
        this.client.on( 'close', () => {
            this.debugLog( 'Connection closed ');
        } );

        this.client.on( 'data', ( data ) => {
            const responsString = data.toString().trim();

            if ( !responsString ) {
                return true;
            }
            this.debugLog( `Receieved "${ responsString }"` );
            this.handleData( responsString );
        } );
    }

    handleData ( data ) {
        if ( !this.isLoggedIn ) {
            if ( data.match( this.loginMatch ) ) {
                this.debugLog( 'got login prompt' );
                this.send( this.username );
            } else if ( data.match( this.passwordMatch ) ) {
                this.debugLog( 'got password prompt' );
                this.send( this.password );
            } else if ( data.match( this.promptMatch ) ) {
                this.isLoggedIn = true;
                this.emit( 'login' );
            }
        } else {
            clearTimeout( this.emitter );
            const newData = data.replace( this.promptMatch, '' );

            if ( this.skipEmit.length > 0 && this.skipEmit.indexOf( newData ) === 0 ) {
                this.skipEmit = this.skipEmit.substring( newData.length );
            } else {
                this.emitData = `${ this.emitData }${ newData }`;
                this.emitter = setTimeout( () => {
                    this.emit( 'data', this.emitData );
                    this.emitData = '';
                }, 50 );
            }
        }
    }

    send ( command ) {
        this.debugLog( `Sending "${ command }"` );
        this.skipEmit = command;
        this.client.write( `${ command }\r\n` );
    };

    debugLog ( string ) {
        if ( this.debug ) {
            console.log( string );
        }
    }

    connect () {
        this.client.connect( this.port, this.host, () => {
            this.debugLog( 'connected' );
        } );
    }

    disconnect () {
        this.client.destroy();
    }
}

module.exports = Telnet;
